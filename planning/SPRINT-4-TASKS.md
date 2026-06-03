# Sprint 4: Inventory Module & Provenance

**Sprint Duration:** 2 weeks (July 15 - July 28, 2026)  
**Sprint Goal:** Build inventory tracking with provenance verification and device scan integration.

---

## Sprint Acceptance Criteria

- [ ] Inventory items tracked with unique identifiers
- [ ] Inventory operations (add, reserve, move, remove) create ledger events
- [ ] Device scans update inventory with actor attribution
- [ ] Inventory provenance traceable through ledger
- [ ] Inventory alerts for low stock/anomalies
- [ ] Inventory dashboard shows real-time status
- [ ] Integration with device events for automated tracking

---

## Backend Inventory System

### Inventory Module Setup
- [ ] Generate `inventory` module using NestJS CLI
- [ ] Generate inventory controller and service
- [ ] Install inventory-related dependencies

### Inventory Entity & Database
- [ ] Create InventoryItem entity with TypeORM
  - [ ] id (uuid, primary key)
  - [ ] sku (string, unique per tenant)
  - [ ] name (string)
  - [ ] description (text)
  - [ ] tenant_id (uuid)
  - [ ] location_id (string)
  - [ ] location_name (string)
  - [ ] quantity (integer)
  - [ ] unit_of_measure (string: each, box, pallet, etc.)
  - [ ] status (enum: available, reserved, in_transit, damaged, expired, removed)
  - [ ] batch_number (string, nullable)
  - [ ] serial_number (string, nullable)
  - [ ] expiration_date (date, nullable)
  - [ ] metadata (jsonb)
  - [ ] created_at, updated_at, last_scanned_at
- [ ] Add indexes on tenant_id, sku, location_id, status, batch_number
- [ ] Add composite index on (tenant_id, location_id, status)
- [ ] Create database migration

### Inventory Addition
- [ ] Implement POST /api/v1/inventory endpoint
  - [ ] Validate inventory item request
  - [ ] Check SKU uniqueness within tenant
  - [ ] Set initial status to 'available'
  - [ ] Set initial location
  - [ ] Create INVENTORY_ADDED ledger event
  - [ ] Return inventory item ID
- [ ] Add rate limiting
- [ ] Validate tenant isolation
- [ ] Support batch import (CSV/JSON)

### Inventory Reservation
- [ ] Implement PATCH /api/v1/inventory/:id/reserve endpoint
  - [ ] Validate reservation quantity <= available quantity
  - [ ] Update quantity (decrement available)
  - [ ] Set status to 'reserved'
  - [ ] Link to order ID if applicable
  - [ ] Create INVENTORY_RESERVED ledger event
  - [ ] Return updated item
- [ ] Implement release reservation endpoint
  - [ ] Reverse reservation
  - [ ] Restore quantity
  - [ ] Create INVENTORY_RESERVATION_RELEASED event
- [ ] Add reservation timeout (auto-release after N minutes)

### Inventory Movement
- [ ] Implement PATCH /api/v1/inventory/:id/move endpoint
  - [ ] Validate new location
  - [ ] Update location_id and location_name
  - [ ] Create INVENTORY_MOVED ledger event
  - [ ] Include from/to locations in event
  - [ ] Track who moved it (actor)
  - [ ] Return updated item
- [ ] Add bulk move endpoint (move multiple items)
- [ ] Validate location exists (future location registry)

### Inventory Removal
- [ ] Implement DELETE /api/v1/inventory/:id endpoint
  - [ ] Validate removal is allowed (not reserved)
  - [ ] Require removal reason
  - [ ] Set status to 'removed'
  - [ ] Zero out quantity
  - [ ] Create INVENTORY_REMOVED ledger event
  - [ ] Return removal confirmation
- [ ] Add soft delete (keep record)
- [ ] Prevent hard delete (audit trail requirement)

### Inventory Scan Integration
- [ ] Implement POST /api/v1/inventory/scan endpoint
  - [ ] Accept device scan data (barcode, QR, RFID)
  - [ ] Lookup inventory by SKU or serial number
  - [ ] Update last_scanned_at timestamp
  - [ ] Create INVENTORY_SCANNED ledger event
  - [ ] Include device actor information
  - [ ] Return inventory item details
- [ ] Add bulk scan endpoint (scan multiple items)
- [ ] Implement scan validation (verify location match)
- [ ] Detect scan anomalies (item in wrong location)

### Inventory Retrieval
- [ ] Implement GET /api/v1/inventory endpoint (list items)
  - [ ] Support pagination
  - [ ] Support filtering (location, status, SKU)
  - [ ] Support sorting (quantity, last_scanned, created_at)
  - [ ] Return item summary
- [ ] Implement GET /api/v1/inventory/:id endpoint
  - [ ] Return full item details
  - [ ] Include provenance timeline
  - [ ] Show reservation history
- [ ] Implement GET /api/v1/inventory/sku/:sku
  - [ ] Allow lookup by SKU
  - [ ] Return item details

### Inventory Provenance
- [ ] Implement GET /api/v1/inventory/:id/provenance endpoint
  - [ ] Query all ledger events for this item
  - [ ] Return chronological event timeline
  - [ ] Include adds, moves, reservations, scans, removals
  - [ ] Show complete chain of custody
- [ ] Add provenance visualization data
  - [ ] Location history
  - [ ] Actor history
  - [ ] Quantity changes over time

### Inventory Anomaly Detection
- [ ] Implement anomaly detection service
  - [ ] Detect unexpected moves (item not in expected location)
  - [ ] Detect missing scans (item not scanned in N days)
  - [ ] Detect quantity discrepancies
  - [ ] Detect expired items
  - [ ] Detect damaged items not removed
- [ ] Create INVENTORY_ANOMALY_DETECTED ledger event
- [ ] Implement GET /api/v1/inventory/anomalies endpoint
  - [ ] List detected anomalies
  - [ ] Filter by type, severity, date
  - [ ] Include resolution status

### Inventory Alerts
- [ ] Implement low stock alert system
  - [ ] Set minimum quantity threshold per SKU
  - [ ] Create INVENTORY_LOW_STOCK alert
  - [ ] Send to notification system
- [ ] Implement expiration alerts
  - [ ] Alert N days before expiration
  - [ ] Create INVENTORY_EXPIRING_SOON alert
- [ ] Implement anomaly alerts
  - [ ] Alert on detected anomalies
  - [ ] Create INVENTORY_ANOMALY alert

### Inventory Ledger Events
- [ ] Create inventory event types
  - [ ] INVENTORY_ADDED
  - [ ] INVENTORY_RESERVED
  - [ ] INVENTORY_RESERVATION_RELEASED
  - [ ] INVENTORY_MOVED
  - [ ] INVENTORY_REMOVED
  - [ ] INVENTORY_SCANNED
  - [ ] INVENTORY_QUANTITY_ADJUSTED
  - [ ] INVENTORY_STATUS_CHANGED
  - [ ] INVENTORY_ANOMALY_DETECTED
  - [ ] INVENTORY_LOW_STOCK
  - [ ] INVENTORY_EXPIRING_SOON
- [ ] Include complete provenance metadata
- [ ] Add location and quantity to all events

### Unit Tests (Target: 100% Coverage)
- [ ] Inventory service tests
  - [ ] Test inventory addition
  - [ ] Test reservation/release
  - [ ] Test movement
  - [ ] Test removal
  - [ ] Test scan processing
  - [ ] Test provenance retrieval
  - [ ] Test anomaly detection
- [ ] Inventory validation tests
  - [ ] Test quantity validation
  - [ ] Test location validation
  - [ ] Test status transitions
  - [ ] Test tenant isolation
- [ ] Inventory provenance tests
  - [ ] Test timeline generation
  - [ ] Test chain of custody
  - [ ] Test event ordering

### Integration Tests
- [ ] Inventory lifecycle integration test
  - [ ] Add inventory
  - [ ] Reserve inventory
  - [ ] Move inventory
  - [ ] Scan inventory
  - [ ] Remove inventory
  - [ ] Verify all events created
- [ ] Device scan integration test
  - [ ] POST /inventory/scan with device auth
  - [ ] Verify INVENTORY_SCANNED event
  - [ ] Verify device actor in event
- [ ] Provenance integration test
  - [ ] Create item with multiple operations
  - [ ] GET /inventory/:id/provenance
  - [ ] Verify complete history
- [ ] Anomaly detection integration test
  - [ ] Create anomaly scenario
  - [ ] Verify anomaly detected
  - [ ] Verify alert created
- [ ] Reservation integration test
  - [ ] Reserve inventory
  - [ ] Try to over-reserve
  - [ ] Release reservation
  - [ ] Verify quantity correct

### OpenAPI Documentation
- [ ] Document inventory addition endpoint
- [ ] Document inventory operations (reserve, move, remove)
- [ ] Document scan endpoint
- [ ] Document provenance endpoint
- [ ] Document anomaly endpoint
- [ ] Add inventory examples
- [ ] Document error codes

---

## Contract Library Updates

### Inventory Contracts Creation
- [ ] Create new `inventory-contracts` library
- [ ] Create inventory item schema
- [ ] Add inventory reservation schema
- [ ] Create inventory move schema
- [ ] Add inventory scan schema
- [ ] Create inventory status enum
- [ ] Add inventory provenance schema
- [ ] Create inventory anomaly schema
- [ ] Export all schemas

### Shared Models Updates
- [ ] Add InventoryItem type
- [ ] Add InventoryOperation type
- [ ] Add InventoryAnomaly type
- [ ] Create inventory error types

---

## Frontend Inventory Management

### Inventory Service
- [ ] Create inventory.service.ts
- [ ] Implement addInventory method
- [ ] Implement getInventory method (with filters)
- [ ] Implement reserveInventory method
- [ ] Implement moveInventory method
- [ ] Implement removeInventory method
- [ ] Implement scanInventory method
- [ ] Implement getProvenance method
- [ ] Implement getAnomalies method

### Inventory List Page
- [ ] Create inventory-list.page.ts
- [ ] Build inventory table
  - [ ] Display SKU, name, location, quantity, status
  - [ ] Show status badges
  - [ ] Add location filter
  - [ ] Add status filter
  - [ ] Add search by SKU/name
  - [ ] Add sorting
- [ ] Add pagination
- [ ] Display inventory count by status
- [ ] Add "Add Inventory" button
- [ ] Show low stock warnings

### Inventory Detail View
- [ ] Create inventory-detail.page.ts
- [ ] Display item information
  - [ ] SKU, name, description
  - [ ] Location, quantity, status
  - [ ] Batch/serial numbers
  - [ ] Expiration date
  - [ ] Last scanned
- [ ] Show provenance timeline
- [ ] Add operation buttons
  - [ ] Reserve
  - [ ] Move
  - [ ] Remove
- [ ] Display scan history
- [ ] Show related orders

### Inventory Provenance View
- [ ] Create inventory-provenance.component.ts
- [ ] Display chronological event list
  - [ ] Event type with icon
  - [ ] Timestamp
  - [ ] Actor
  - [ ] Location changes
  - [ ] Quantity changes
- [ ] Visualize location history on map/diagram
- [ ] Show chain of custody

### Inventory Scan Interface
- [ ] Create inventory-scan.page.ts
- [ ] Build scan input interface
  - [ ] Barcode input
  - [ ] Camera scan button (if available)
  - [ ] Manual SKU entry
- [ ] Display scan results
  - [ ] Item details
  - [ ] Current location
  - [ ] Quantity
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

### Inventory Anomaly View
- [ ] Create inventory-anomalies.page.ts
- [ ] List detected anomalies
  - [ ] Type, severity
  - [ ] Affected item
  - [ ] Detection time
  - [ ] Status
- [ ] Add resolution workflow
- [ ] Show anomaly details
- [ ] Filter by type/status

### Unit Tests
- [ ] Inventory service tests
- [ ] Inventory component tests
- [ ] Provenance component tests
- [ ] Scan component tests
- [ ] Dashboard tests

---

## E2E Testing

### Inventory Management E2E
- [ ] Test inventory addition flow
- [ ] Test inventory reservation
- [ ] Test inventory movement
- [ ] Test inventory removal
- [ ] Test scan workflow
- [ ] Test provenance viewing

### Anomaly Detection E2E
- [ ] Test anomaly detection
- [ ] Test anomaly alerts
- [ ] Test anomaly resolution

---

## Documentation

### Technical Documentation
- [ ] Document inventory tracking model
- [ ] Add provenance guide
- [ ] Document scan integration
- [ ] Create anomaly detection guide

### Integration Guides
- [ ] Create inventory integration guide
- [ ] Document device scan protocol
- [ ] Add troubleshooting guide

### README Updates
- [ ] Add inventory setup instructions
- [ ] Update architecture diagram

---

## Definition of Done

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
