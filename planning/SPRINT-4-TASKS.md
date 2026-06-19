# Sprint 4: Inventory Module & Provenance

**Sprint Duration:** 2 weeks (July 15 - July 28, 2026)  
**Sprint Goal:** Build inventory tracking with provenance verification and device scan integration.
**Status:** In progress (inventory add/list/detail retrieval including opt-in provenance timeline, CSV/JSON batch import, reservation including timeout release, movement including bulk move, quantity adjustment, status change, removal, detail operations, location-validating single/bulk scan and automated device-event tracking with reduced-motion feedback, provenance and location-history diagrams with reservation/scan histories, anomaly-detection with type/severity/date filtering, quantity discrepancy and unexpected-move detection, UI toaster notifications, and UI resolution, alert, inventory dashboard, and visual primitive integration testing vertical slices completed through 2026-06-18)

---

## Sprint Acceptance Criteria

- [x] Inventory items tracked with unique identifiers
- [x] Inventory operations (add, reserve, move, remove) create ledger events
- [x] Device scans update inventory with actor attribution
- [x] Inventory provenance traceable through ledger
- [x] Inventory provenance timeline and anomaly visuals are available in the UI
- [x] Inventory alerts for low stock/anomalies
- [ ] Inventory dashboard shows real-time status (current loaded dashboard with refresh and quick alert/anomaly actions completed; push updates remain planned)
- [x] Integration with device events for automated tracking

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
- [x] Support batch import (CSV/JSON)

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
- [x] Add reservation timeout (auto-release after N minutes)
  - [x] Store reservation expiration metadata
  - [x] Release expired reservations through a ledger-backed endpoint
  - [x] Record timeout release provenance

### Inventory Movement
- [x] Implement PATCH /api/v1/inventory/:id/move endpoint
  - [x] Validate new location request fields
  - [x] Update location_id and location_name
  - [x] Create INVENTORY_MOVED ledger event
  - [x] Include from/to locations in event
  - [x] Track who moved it (actor)
  - [x] Return updated item
- [x] Add bulk move endpoint (move multiple items)
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
- [x] Add bulk scan endpoint (scan up to 100 items with per-item results)
- [x] Implement scan validation (verify location match against current item location)
- [x] Detect scan anomalies (item scanned in wrong location)

### Inventory Retrieval
- [x] Implement GET /api/v1/inventory endpoint (list items)
  - [x] Support pagination
  - [x] Support filtering (location, status, SKU)
  - [x] Support sorting (quantity, last_scanned, created_at)
  - [x] Return item summary
- [x] Implement GET /api/v1/inventory/:id endpoint
  - [x] Return full item details
  - [x] Include provenance timeline
  - [x] Show reservation history
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
  - [x] Detect unexpected moves (item not in expected location)
  - [x] Detect missing scans (item not scanned in N days)
  - [x] Detect quantity discrepancies
  - [x] Detect expired items
  - [x] Detect damaged items not removed
  - [x] Detect unexpected scan locations
- [x] Create INVENTORY_ANOMALY_DETECTED ledger event
- [x] Implement GET /api/v1/inventory/anomalies endpoint
  - [x] List detected anomalies
  - [x] Filter by type and severity
  - [x] Filter by date
  - [x] Include resolution status
- [x] Implement POST /api/v1/inventory/anomalies/detect for ledger-backed detection

### Inventory Alerts
- [x] Implement low stock alert system
  - [x] Set minimum quantity threshold per SKU
  - [x] Create INVENTORY_LOW_STOCK alert
  - [x] Send to in-app toaster notification system
- [x] Implement expiration alerts
  - [x] Alert N days before expiration
  - [x] Create INVENTORY_EXPIRING_SOON alert
- [x] Implement anomaly alerts
  - [x] Alert on detected anomalies
  - [x] Create INVENTORY_ANOMALY alert

### Inventory Ledger Events
- [x] Create inventory event types
  - [x] INVENTORY_ADDED
  - [x] INVENTORY_RESERVED
  - [x] INVENTORY_RESERVATION_RELEASED
  - [x] INVENTORY_MOVED
  - [x] INVENTORY_REMOVED
  - [x] INVENTORY_SCANNED
  - [x] INVENTORY_QUANTITY_ADJUSTED
  - [x] INVENTORY_STATUS_CHANGED
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
- [x] Inventory validation tests
  - [x] Test quantity validation
  - [x] Test scan location validation
  - [x] Test status transitions
  - [x] Test tenant isolation
- [x] Inventory provenance tests
  - [x] Test timeline generation
  - [x] Test chain of custody
  - [x] Test event ordering

### Integration Tests
- [x] Inventory lifecycle integration test
  - [x] Add inventory
  - [x] Reserve inventory
  - [x] Move inventory
  - [x] Adjust quantity
  - [x] Change status
  - [x] Scan inventory
  - [x] Remove inventory
  - [x] Verify all events created
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
  - [x] Release expired reservation through timeout workflow

### OpenAPI Documentation
- [x] Document inventory addition endpoint
- [x] Document inventory operations (reserve, move, bulk move, quantity adjustment, status change, remove)
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
- [x] Add InventoryOperation type
- [x] Add InventoryAnomaly type
- [x] Create inventory error types

---

## Frontend Inventory Management

### Inventory Service
- [x] Create inventory.service.ts
- [x] Implement addInventory method
- [x] Implement importInventory method
- [x] Implement getInventory method (with filters)
- [x] Implement getInventoryItemWithProvenance method
- [x] Implement reserveInventory method
- [x] Implement releaseExpiredReservations method
- [x] Implement moveInventory method
- [x] Implement moveInventoryBatch method
- [x] Implement adjustInventoryQuantity method
- [x] Implement changeInventoryStatus method
- [x] Implement removeInventory method
- [x] Implement scanInventory method
- [x] Implement scanInventoryBatch method
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
- [x] Add CSV/JSON import panel with per-row results
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
- [x] Add operation buttons
  - [x] Reserve
  - [x] Move
  - [x] Adjust quantity
  - [x] Change status
  - [x] Remove
- [x] Display scan history
- [x] Show related active reservation order

### Inventory Provenance View
- [x] Add inventory provenance view to inventory page
- [x] Display chronological event list
  - [x] Event type with shared timeline marker
  - [x] Timestamp
  - [x] Actor
  - [x] Location changes
  - [x] Quantity changes
- [x] Visualize location history on map/diagram
- [x] Show chain of custody
- [x] Reuse shared timeline rail and ledger event card components
- [x] Add provenance diagram data model for movement, actor, location, quantity, and anomaly state
- [x] Add scan accepted/rejected animation with reduced-motion fallback

### Inventory Scan Interface
- [x] Add inventory scan interface to inventory page
- [x] Build scan input interface
  - [x] Barcode input
  - [ ] Camera scan button (if available)
  - [x] Manual SKU entry
- [x] Display accepted/rejected scan feedback
- [x] Show scan history
- [x] Add bulk scan mode with per-item accepted/rejected results

### Inventory Dashboard
- [x] Create inventory-dashboard.component.ts
- [x] Display inventory metrics
  - [x] Total items
  - [x] Items by status
  - [x] Items by location
  - [x] Low stock count
  - [x] Expiring soon count
- [x] Show recent anomalies
- [x] Display recent scans
- [x] Add quick actions
- [x] Add inventory health visuals for low stock, expiring soon, damaged, reserved, and removed states

### Inventory Alerts View
- [x] Add inventory alerts view to inventory page
- [x] Show alert severity, item, location, and recommended action
- [x] Filter alerts by type and severity
- [x] Add unit tests for alert loading and generation
- [x] Add toaster notifications for generated alerts and inventory workflow outcomes

### Inventory Anomaly View
- [x] Add inventory anomaly view to inventory page
- [x] List detected anomalies
  - [x] Type, severity
  - [x] Affected item
  - [x] Detection time
  - [x] Status
- [x] Add resolution workflow
- [x] Show anomaly details and remediation
- [x] Filter by type/severity
- [x] Use shared severity chip and anomaly card styles from the global style system
- [x] Add unit tests for anomaly severity/status variants and non-color state labels

### Unit Tests
- [x] Inventory service tests
- [x] Inventory component tests
- [x] Provenance view tests
- [x] Scan interface tests
- [x] Dashboard tests
- [x] Inventory visual primitive integration tests for provenance, scan feedback, anomaly cards, health states, empty states, and reduced-motion behavior

---

## E2E Testing

### Inventory Management E2E
- [x] Test inventory addition flow
- [x] Test inventory CSV import flow with mixed imported/rejected results
- [x] Test inventory reservation
- [x] Test reservation timeout release workflow
- [x] Test inventory movement
- [x] Test inventory bulk movement
- [x] Test inventory quantity adjustment
- [x] Test inventory status change
- [x] Test inventory removal
- [x] Test scan workflow
- [x] Test wrong-location scan rejection with expected/scanned location feedback
- [x] Test bulk scan workflow with mixed accepted/rejected results
- [x] Test device-event-driven inventory scan provenance
- [x] Test provenance viewing
- [x] Test full inventory detail viewing with automatic provenance loading
- [x] Test combined detail/provenance retrieval
- [x] Test inventory detail reserve, release, move, and remove operations
- [x] Test provenance timeline renders full chain of custody with actor and location labels
- [x] Test provenance diagram renders movement, actor, location, quantity, and anomaly state
- [x] Test location history diagram renders route steps and anomaly state
- [x] Test derived reservation history and accepted/rejected scan history
- [x] Test scan accepted/rejected feedback is accessible and does not depend on motion
- [x] Test anomaly cards render severity, status, and remediation action consistently
- [x] Test unexpected-move anomaly display through anomaly filters
- [x] Test initial low-stock inventory health visual uses a text label and does not clip across configured browser/device projects
- [x] Test dashboard health, location, recent scan, and quick action states

### Anomaly Detection E2E
- [x] Test anomaly detection
- [x] Test anomaly alerts
- [x] Test inventory toaster notifications
- [x] Test anomaly resolution

---

## Documentation

### Technical Documentation
- [x] Document inventory tracking model
- [x] Add provenance guide
- [x] Document reservation and scan history response/UI behavior
- [x] Document reservation timeout release workflow
- [x] Document scan integration
- [x] Document bulk scan protocol and partial-success behavior
- [x] Document bulk movement protocol and partial-success behavior
- [x] Document wrong-location scan validation, anomaly, and clearing behavior
- [x] Document expected-location unexpected-move anomaly behavior
- [x] Create anomaly detection guide
- [x] Document inventory detail retrieval and UI state
- [x] Document combined detail/provenance retrieval
- [x] Document inventory detail operation behavior
- [x] Document dashboard inventory health visual state model
- [x] Document provenance timeline, scan feedback, and anomaly card visual state model

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
- [x] Focused inventory backend unit and PostgreSQL integration suites passed: 2 suites / 47 tests
- [x] Focused Angular inventory service and component coverage passed: 2 files / 35 tests
- [x] Full shared-models regression suite passed: 1 suite / 26 tests
- [x] Full ledger-api regression suite passed: 38 suites / 241 tests
- [x] Full ledger-web regression suite passed: 37 files / 201 tests
- [x] `pnpm nx run ledger-api:build --skip-nx-cache`
- [x] `pnpm nx run ledger-web:build --skip-nx-cache`
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache`
- [x] Updated inventory Playwright suite passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 100 tests
- [x] Updated detail-view Playwright matrix passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari
- [x] Anomaly date-filter increment verified with focused shared-models, inventory API, Angular inventory service/component, and inventory Playwright suites
- [x] Quantity discrepancy anomaly increment verified with focused shared-models, inventory API, Angular inventory component, and inventory Playwright suites
- [x] Bulk move increment verified with focused shared-models, inventory API, Angular inventory service/component, and inventory Playwright suites
- [x] Visual primitive integration increment verified with focused Angular inventory dashboard/component specs and inventory Playwright suite
- [x] Batch import increment verified with focused shared-models, inventory API, Angular inventory service/component, and inventory Playwright suites
- [x] Device-event tracking increment verified with focused device service, inventory PostgreSQL integration, Angular inventory component, and inventory Playwright suites
- [x] Reservation timeout increment verified with focused shared-models, inventory API, Angular inventory service/component, and inventory Playwright suites
- [x] Unexpected-move anomaly increment verified with focused inventory API unit/integration and inventory Playwright suites
- [x] Combined detail/provenance increment verified with focused inventory API, Angular inventory service/component, and inventory Playwright suites
- [x] Toaster notification increment verified with focused Angular inventory component and inventory Playwright suites
- [x] `pnpm nx run-many --target=lint --all --skip-nx-cache --parallel=3` - all 10 projects passed
- [x] `pnpm nx run-many --target=test --all --skip-nx-cache --parallel=3` - shared-models 26 tests, ledger-api 241 tests, ledger-web 201 tests passed
- [x] `pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3` - all 9 projects passed
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --workers=1` - 589 passed, 16 skipped
- [x] `git diff --check`

A task is considered complete when:
- [x] Code written and follows coding standards
- [x] Unit tests written and passing (90%+ coverage)
- [x] Integration tests written and passing
- [x] E2E tests written and passing
- [ ] Code reviewed and approved
- [ ] OpenAPI documentation updated
- [x] Technical documentation updated
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
