# Sprint 4: Inventory Module & Provenance

**Sprint Duration:** 2 weeks (July 15 - July 28, 2026)  
**Sprint Goal:** Build inventory tracking with provenance verification and device scan integration.
**Status:** In progress (inventory add/list/detail retrieval, reservation, movement, removal, scan, provenance, anomaly-detection, and alert vertical slices completed on 2026-06-12)

---

## Sprint Acceptance Criteria

- [x] Inventory items tracked with unique identifiers
- [x] Inventory operations (add, reserve, move, remove) create ledger events
- [x] Device scans update inventory with actor attribution
- [x] Inventory provenance traceable through ledger
- [x] Inventory provenance timeline and anomaly visuals are available in the UI
- [x] Inventory alerts for low stock/anomalies
- [ ] Inventory dashboard shows real-time status
- [ ] Integration with device events for automated tracking

---

## Backend Inventory System

### Inventory Module Setup
- [x] Generate `inventory` module using NestJS CLI
- [x] Generate inventory controller and service
- [x] Install inventory-related dependencies (implemented with existing TypeORM, Zod, and RxJS dependencies)

### Inventory Entity & Database
- [x] Create InventoryItem entity with TypeORM
  - [x] id (uuid, primary key)
  - [x] sku (string, unique per tenant)
  - [x] name (string)
  - [x] description (text)
  - [x] tenant_id (uuid)
  - [x] location_id (string)
  - [x] location_name (string)
  - [x] quantity (integer)
  - [x] unit_of_measure (string: each, box, pallet, etc.)
  - [x] status (enum: available, reserved, in_transit, damaged, expired, removed)
  - [x] batch_number (string, nullable)
  - [x] serial_number (string, nullable)
  - [x] expiration_date (date, nullable)
  - [x] metadata (jsonb)
  - [x] created_at, updated_at, last_scanned_at
- [x] Add indexes on tenant_id, sku, location_id, status, batch_number
- [x] Add composite index on (tenant_id, location_id, status)
- [x] Create database migration

### Inventory Addition
- [x] Implement POST /api/v1/inventory endpoint
  - [x] Validate inventory item request
  - [x] Check SKU uniqueness within tenant
  - [x] Set initial status to 'available'
  - [x] Set initial location
  - [x] Create INVENTORY_ADDED ledger event
  - [x] Return inventory item ID
- [x] Add rate limiting
- [x] Validate tenant isolation
- [ ] Support batch import (CSV/JSON)

### Inventory Reservation
- [x] Implement PATCH /api/v1/inventory/:id/reserve endpoint
  - [x] Validate reservation quantity <= available quantity
  - [x] Update quantity (decrement available)
  - [x] Set status to 'reserved'
  - [x] Link to order ID if applicable
  - [x] Create INVENTORY_RESERVED ledger event
  - [x] Return updated item
- [x] Implement release reservation endpoint
  - [x] Reverse reservation
  - [x] Restore quantity
  - [x] Create INVENTORY_RESERVATION_RELEASED event
- [ ] Add reservation timeout (auto-release after N minutes)

### Inventory Movement
- [x] Implement PATCH /api/v1/inventory/:id/move endpoint
  - [x] Validate new location request fields
  - [x] Update location_id and location_name
  - [x] Create INVENTORY_MOVED ledger event
  - [x] Include from/to locations in event
  - [x] Track who moved it (actor)
  - [x] Return updated item
- [ ] Add bulk move endpoint (move multiple items)
- [ ] Validate location exists (future location registry)

### Inventory Removal
- [x] Implement DELETE /api/v1/inventory/:id endpoint
  - [x] Validate removal is allowed (not reserved)
  - [x] Require removal reason
  - [x] Set status to 'removed'
  - [x] Zero out quantity
  - [x] Create INVENTORY_REMOVED ledger event
  - [x] Return removal confirmation
- [x] Add soft delete (keep record)
- [x] Prevent hard delete (audit trail requirement)

### Inventory Scan Integration
- [x] Implement POST /api/v1/inventory/scan endpoint
  - [x] Accept device scan data (barcode, QR, RFID)
  - [x] Lookup inventory by SKU or serial number
  - [x] Update last_scanned_at timestamp
  - [x] Create INVENTORY_SCANNED ledger event
  - [x] Include device actor information
  - [x] Return inventory item details
- [ ] Add bulk scan endpoint (scan multiple items)
- [ ] Implement scan validation (verify location match)
- [ ] Detect scan anomalies (item in wrong location)

### Inventory Retrieval
- [x] Implement GET /api/v1/inventory endpoint (list items)
  - [x] Support pagination
  - [x] Support filtering (location, status, SKU)
  - [x] Support sorting (quantity, last_scanned, created_at)
  - [x] Return item summary
- [x] Implement GET /api/v1/inventory/:id endpoint
  - [x] Return full item details
  - [ ] Include provenance timeline
  - [ ] Show reservation history
- [x] Implement GET /api/v1/inventory/sku/:sku
  - [x] Allow normalized tenant-scoped lookup by SKU
  - [x] Return item details

### Inventory Provenance
- [x] Implement GET /api/v1/inventory/:id/provenance endpoint
  - [x] Query all ledger events for this item
  - [x] Return chronological event timeline
  - [x] Include adds, moves, reservations, scans, removals
  - [x] Show complete chain of custody
- [x] Add provenance visualization data
  - [x] Location history
  - [x] Actor history
  - [x] Quantity changes over time

### Inventory Anomaly Detection
- [x] Implement anomaly detection service
  - [ ] Detect unexpected moves (item not in expected location)
  - [x] Detect missing scans (item not scanned in N days)
  - [ ] Detect quantity discrepancies
  - [x] Detect expired items
  - [x] Detect damaged items not removed
- [x] Create INVENTORY_ANOMALY_DETECTED ledger event
- [x] Implement GET /api/v1/inventory/anomalies endpoint
  - [x] List detected anomalies
  - [x] Filter by type and severity
  - [ ] Filter by date
  - [x] Include resolution status
- [x] Implement POST /api/v1/inventory/anomalies/detect for ledger-backed detection

### Inventory Alerts
- [x] Implement low stock alert system
  - [x] Set minimum quantity threshold per SKU
  - [x] Create INVENTORY_LOW_STOCK alert
  - [ ] Send to notification system
- [x] Implement expiration alerts
  - [x] Alert N days before expiration
  - [x] Create INVENTORY_EXPIRING_SOON alert
- [x] Implement anomaly alerts
  - [x] Alert on detected anomalies
  - [x] Create INVENTORY_ANOMALY alert

### Inventory Ledger Events
- [ ] Create inventory event types
  - [x] INVENTORY_ADDED
  - [x] INVENTORY_RESERVED
  - [x] INVENTORY_RESERVATION_RELEASED
  - [x] INVENTORY_MOVED
  - [x] INVENTORY_REMOVED
  - [x] INVENTORY_SCANNED
  - [ ] INVENTORY_QUANTITY_ADJUSTED
  - [ ] INVENTORY_STATUS_CHANGED
  - [x] INVENTORY_ANOMALY_DETECTED
  - [x] INVENTORY_LOW_STOCK
  - [x] INVENTORY_EXPIRING_SOON
- [x] Include complete provenance metadata for implemented inventory addition events
- [x] Add location and quantity to implemented inventory addition events

### Unit Tests (Behavior Coverage)
- [x] Inventory service tests
  - [x] Test inventory addition
  - [x] Test reservation/release
  - [x] Test movement
  - [x] Test removal
  - [x] Test scan processing
  - [x] Test provenance retrieval
  - [x] Test anomaly detection
  - [x] Test alert generation
- [ ] Inventory validation tests
  - [x] Test quantity validation
  - [ ] Test location validation
  - [ ] Test status transitions
  - [x] Test tenant isolation
- [x] Inventory provenance tests
  - [x] Test timeline generation
  - [x] Test chain of custody
  - [x] Test event ordering

### Integration Tests
- [ ] Inventory lifecycle integration test
  - [ ] Add inventory
  - [ ] Reserve inventory
  - [ ] Move inventory
  - [x] Scan inventory
  - [x] Remove inventory
  - [ ] Verify all events created
- [x] Device scan integration test
  - [x] POST /inventory/scan with device auth
  - [x] Verify INVENTORY_SCANNED event
  - [x] Verify device actor in event
- [x] Provenance integration test
  - [x] Create item with multiple operations
  - [x] GET /inventory/:id/provenance
  - [x] Verify complete history
- [x] Anomaly detection integration test
  - [x] Create anomaly scenario
  - [x] Verify anomaly detected
  - [x] Verify alert created
- [x] Reservation integration test
  - [x] Reserve inventory
  - [x] Try to over-reserve
  - [x] Release reservation
  - [x] Verify quantity correct

### OpenAPI Documentation
- [x] Document inventory addition endpoint
- [x] Document inventory operations (reserve, move, remove)
- [x] Document scan endpoint
- [x] Document provenance endpoint
- [x] Document anomaly endpoint
- [x] Document alert endpoints
- [x] Add inventory examples
- [ ] Document error codes

---

## Contract Library Updates

### Inventory Contracts Creation
- [x] Create new `inventory-contracts` library
- [x] Create inventory item schema
- [x] Add inventory reservation schema
- [x] Create inventory move schema
- [x] Add inventory scan schema
- [x] Create inventory status enum
- [x] Add inventory provenance schema
- [x] Create inventory anomaly schema
- [x] Export all implemented schemas

### Shared Models Updates
- [x] Add InventoryItem type
- [ ] Add InventoryOperation type
- [x] Add InventoryAnomaly type
- [x] Create inventory error types

---

## Frontend Inventory Management

### Inventory Service
- [x] Create inventory.service.ts
- [x] Implement addInventory method
- [x] Implement getInventory method (with filters)
- [x] Implement reserveInventory method
- [x] Implement moveInventory method
- [x] Implement removeInventory method
- [x] Implement scanInventory method
- [x] Implement getProvenance method
- [x] Implement getAnomalies method
- [x] Implement getAlerts and generateAlerts methods

### Inventory List Page
- [x] Create inventory-list page
- [x] Build inventory table
  - [x] Display SKU, name, location, quantity, status
  - [x] Show status badges
  - [x] Add location filter
  - [x] Add status filter
  - [x] Add search by SKU/name
  - [x] Add sorting
- [x] Add pagination
- [x] Display inventory count by status
- [x] Add "Add Inventory" button
- [x] Show low stock warnings

### Inventory Detail View
- [x] Add inventory detail view to the inventory page
- [x] Display item information
  - [x] SKU, name, description
  - [x] Location, quantity, status
  - [x] Batch/serial numbers
  - [x] Expiration date
  - [x] Last scanned
- [x] Show provenance timeline
- [ ] Add operation buttons
  - [ ] Reserve
  - [ ] Move
  - [ ] Remove
- [ ] Display scan history
- [x] Show related active reservation order

### Inventory Provenance View
- [x] Add inventory provenance view to inventory page
- [x] Display chronological event list
  - [x] Event type with shared timeline marker
  - [x] Timestamp
  - [x] Actor
  - [x] Location changes
  - [x] Quantity changes
- [ ] Visualize location history on map/diagram
- [x] Show chain of custody
- [x] Reuse shared timeline rail and ledger event card components
- [ ] Add provenance diagram data model for movement, actor, location, quantity, and anomaly state
- [ ] Add scan accepted/rejected animation with reduced-motion fallback

### Inventory Scan Interface
- [x] Add inventory scan interface to inventory page
- [x] Build scan input interface
  - [x] Barcode input
  - [ ] Camera scan button (if available)
  - [x] Manual SKU entry
- [x] Display accepted/rejected scan feedback
- [ ] Show scan history
- [ ] Add bulk scan mode

### Inventory Dashboard
- [ ] Create inventory-dashboard.component.ts
- [ ] Display inventory metrics
  - [ ] Total items
  - [ ] Items by status
  - [ ] Items by location
  - [ ] Low stock count
  - [ ] Expiring soon count
- [ ] Show recent anomalies
- [ ] Display recent scans
- [ ] Add quick actions
- [ ] Add inventory health visuals for low stock, expiring soon, damaged, reserved, and removed states

### Inventory Alerts View
- [x] Add inventory alerts view to inventory page
- [x] Show alert severity, item, location, and recommended action
- [x] Filter alerts by type and severity
- [x] Add unit tests for alert loading and generation

### Inventory Anomaly View
- [x] Add inventory anomaly view to inventory page
- [x] List detected anomalies
  - [x] Type, severity
  - [x] Affected item
  - [x] Detection time
  - [x] Status
- [ ] Add resolution workflow
- [x] Show anomaly details and remediation
- [x] Filter by type/severity
- [x] Use shared severity chip and anomaly card styles from the global style system
- [x] Add unit tests for anomaly severity/status variants and non-color state labels

### Unit Tests
- [x] Inventory service tests
- [x] Inventory component tests
- [x] Provenance view tests
- [x] Scan interface tests
- [ ] Dashboard tests
- [ ] Inventory visual primitive integration tests for provenance, scan feedback, anomaly cards, health states, empty states, and reduced-motion behavior

---

## E2E Testing

### Inventory Management E2E
- [x] Test inventory addition flow
- [x] Test inventory reservation
- [x] Test inventory movement
- [x] Test inventory removal
- [x] Test scan workflow
- [x] Test provenance viewing
- [x] Test full inventory detail viewing with automatic provenance loading
- [x] Test provenance timeline renders full chain of custody with actor and location labels
- [x] Test scan accepted/rejected feedback is accessible and does not depend on motion
- [x] Test anomaly cards render severity, status, and remediation action consistently
- [x] Test initial low-stock inventory health visual uses a text label and does not clip across configured browser/device projects

### Anomaly Detection E2E
- [x] Test anomaly detection
- [x] Test anomaly alerts
- [ ] Test anomaly resolution

---

## Documentation

### Technical Documentation
- [x] Document inventory tracking model
- [x] Add provenance guide
- [x] Document scan integration
- [x] Create anomaly detection guide
- [x] Document inventory detail retrieval and UI state
- [ ] Document provenance timeline, scan feedback, anomaly card, and inventory health visual state model

### Integration Guides
- [ ] Create inventory integration guide
- [ ] Document device scan protocol
- [ ] Add troubleshooting guide

### README Updates
- [ ] Add inventory setup instructions
- [ ] Update architecture diagram

---

## Definition of Done

### Sprint 4 Progress Verification

- [x] `pnpm nx run inventory-contracts:lint --skip-nx-cache`
- [x] `pnpm nx run inventory-contracts:build --skip-nx-cache`
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache`
- [x] Focused inventory backend unit and PostgreSQL integration suites passed: 2 suites / 30 tests
- [x] Focused Angular inventory service and component coverage passed within the full web suite
- [x] Full shared-models regression suite passed: 1 suite / 23 tests
- [x] Full ledger-api regression suite passed: 38 suites / 222 tests
- [x] Full ledger-web regression suite passed: 36 files / 180 tests
- [x] `pnpm nx run ledger-api:build --skip-nx-cache`
- [x] `pnpm nx run ledger-web:build --skip-nx-cache`
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache`
- [x] Updated inventory Playwright suite passed in Chromium: 11 tests
- [ ] Updated detail-view Playwright matrix: passed Chromium, WebKit, Mobile Chrome, and Mobile Safari; Firefox app bootstrap blocked by the temporary static server, and the managed dev stack is blocked by a pre-existing HTTP 500 server on port 4200
- [x] `pnpm nx run-many --target=lint --all --skip-nx-cache --parallel=3` - all 10 projects passed
- [x] `pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3` - all 9 projects passed
- [x] `git diff --check`

A task is considered complete when:
- [ ] Code written and follows coding standards
- [ ] Unit tests written and passing (90%+ coverage)
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing
- [ ] Code reviewed and approved
- [ ] OpenAPI documentation updated
- [ ] Technical documentation updated
- [ ] No critical or high severity bugs
- [ ] Deployed to development environment
- [ ] Demo-ready for sprint review

---

## Sprint Risks

### High Priority Risks
- **Scan Performance:** High-volume scans could overwhelm system (mitigation: batch endpoints, rate limiting)
- **Provenance Query Performance:** Large history could slow queries (mitigation: indexes, pagination)

### Medium Priority Risks
- **Location Model:** Location registry may need to be built (mitigation: defer to future sprint)
- **Anomaly Detection Accuracy:** False positives could create noise (mitigation: tunable thresholds)

---

## Next Sprint Preview (Sprint 5: WebSockets & Production)

Sprint 5 will complete PI-1 with:
- Real-time WebSocket notifications
- Production infrastructure
- Monitoring and observability
- Final integration and polish
