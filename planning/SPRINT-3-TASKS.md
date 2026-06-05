# Sprint 3: Orders Module & Ledger Integration

**Sprint Duration:** 2 weeks (July 1 - July 14, 2026)  
**Sprint Goal:** Implement order lifecycle management with full ledger audit trail and proof generation.
**Status:** Started early on 2026-06-05 with order contracts, shared exports, documentation, and schema tests.

---

## Sprint Acceptance Criteria

- [ ] Orders can be created with proper validation
- [ ] Order status changes create ledger events
- [ ] Order history fully auditable via ledger
- [ ] Order UI includes lifecycle milestone visuals and proof status indicators
- [ ] Order proofs generated for verification
- [ ] Correlation IDs link related order events
- [ ] Order list and detail views functional in UI
- [ ] Integration tests validate order workflows

---

## Backend Orders System

### Orders Module Setup
- [ ] Generate `orders` module using NestJS CLI
- [ ] Generate orders controller and service
- [ ] Install order-related dependencies

### Order Entity & Database
- [ ] Create Order entity with TypeORM
  - [ ] id (uuid, primary key)
  - [ ] order_number (string, unique)
  - [ ] tenant_id (uuid)
  - [ ] customer_id (string)
  - [ ] customer_name (string)
  - [ ] customer_email (string, nullable)
  - [ ] status (enum: pending, confirmed, processing, shipped, delivered, cancelled, failed)
  - [ ] items (jsonb array of order items)
  - [ ] total_amount (decimal)
  - [ ] currency (string, default 'USD')
  - [ ] shipping_address (jsonb)
  - [ ] billing_address (jsonb)
  - [ ] metadata (jsonb)
  - [ ] created_at, updated_at, confirmed_at, shipped_at, delivered_at, cancelled_at
- [ ] Add indexes on tenant_id, order_number, status, customer_id, created_at
- [ ] Add composite index on (tenant_id, status, created_at)
- [ ] Create database migration

### Order Creation
- [ ] Implement POST /api/v1/orders endpoint
  - [ ] Validate order creation request
  - [ ] Generate unique order number
  - [ ] Validate customer information
  - [ ] Validate order items (SKU, quantity, price)
  - [ ] Calculate total amount
  - [ ] Set initial status to 'pending'
  - [ ] Create ORDER_CREATED ledger event with correlation ID
  - [ ] Return order ID and order number
- [ ] Add order creation rate limiting per user
- [ ] Validate tenant isolation
- [ ] Implement idempotency key support (prevent duplicate orders)

### Order Status Management
- [ ] Implement PATCH /api/v1/orders/:id/status endpoint
  - [ ] Validate status transitions (pending → confirmed → processing → shipped → delivered)
  - [ ] Prevent invalid transitions (e.g., delivered → pending)
  - [ ] Update status and relevant timestamp
  - [ ] Create ORDER_STATUS_CHANGED ledger event
  - [ ] Include correlation ID from original order creation
  - [ ] Return updated order
- [ ] Implement status transition validation rules
- [ ] Add reason field for status changes
- [ ] Create audit trail for status changes

### Order Retrieval
- [ ] Implement GET /api/v1/orders endpoint (list orders)
  - [ ] Support pagination (limit, offset)
  - [ ] Support filtering (status, customer_id, date range)
  - [ ] Support sorting (created_at, total_amount)
  - [ ] Return order summary (exclude full items)
  - [ ] Include total count for pagination
- [ ] Implement GET /api/v1/orders/:id endpoint
  - [ ] Return full order details including items
  - [ ] Include related ledger events
  - [ ] Calculate order timeline from ledger
- [ ] Implement GET /api/v1/orders/number/:orderNumber
  - [ ] Allow lookup by order number
  - [ ] Return full order details

### Order Cancellation
- [ ] Implement POST /api/v1/orders/:id/cancel endpoint
  - [ ] Validate cancellation is allowed (not shipped/delivered)
  - [ ] Require cancellation reason
  - [ ] Set status to cancelled
  - [ ] Set cancelled_at timestamp
  - [ ] Create ORDER_CANCELLED ledger event
  - [ ] Include correlation ID
  - [ ] Return cancelled order

### Order Search
- [ ] Implement GET /api/v1/orders/search endpoint
  - [ ] Search by order number
  - [ ] Search by customer name
  - [ ] Search by customer email
  - [ ] Search by date range
  - [ ] Full-text search on metadata
  - [ ] Return matching orders with pagination

### Order Ledger Events
- [x] Create order event types in shared-models
  - [x] ORDER_CREATED
  - [x] ORDER_STATUS_CHANGED
  - [x] ORDER_CONFIRMED
  - [x] ORDER_PROCESSING
  - [x] ORDER_SHIPPED
  - [x] ORDER_DELIVERED
  - [x] ORDER_CANCELLED
  - [x] ORDER_PAYMENT_RECEIVED
  - [x] ORDER_REFUND_ISSUED
- [ ] Ensure all order events include correlation ID
- [ ] Add order number to all order events
- [ ] Include customer ID in actor metadata
- [ ] Track status transition reasons

### Order Proofs
- [ ] Implement GET /api/v1/orders/:id/proof endpoint
  - [ ] Generate order proof from ledger events
  - [ ] Include order creation event
  - [ ] Include all status change events
  - [ ] Calculate proof hash
  - [ ] Return proof JSON
- [ ] Create proof verification endpoint POST /api/v1/proofs/verify
  - [ ] Accept proof JSON
  - [ ] Verify proof hash
  - [ ] Validate event chain
  - [ ] Return verification result
- [ ] Add proof metadata (generated_at, generator)

### Correlation ID Tracking
- [ ] Generate correlation ID on order creation
- [ ] Pass correlation ID to all related order events
- [ ] Implement GET /api/v1/orders/:id/timeline
  - [ ] Query ledger events by correlation ID
  - [ ] Return chronological event timeline
  - [ ] Include event type, timestamp, actor, result
- [ ] Add correlation ID to order detail response

### Unit Tests (Behavior Coverage)
- [ ] Order service tests
  - [ ] Test order creation
  - [ ] Test order number generation uniqueness
  - [ ] Test status transitions
  - [ ] Test invalid status transitions
  - [ ] Test order cancellation
  - [ ] Test order search
- [ ] Order validation tests
  - [ ] Test item validation
  - [ ] Test amount calculation
  - [ ] Test customer data validation
  - [ ] Test tenant isolation
- [ ] Order proof tests
  - [ ] Test proof generation
  - [ ] Test proof verification
  - [ ] Test proof hash calculation
- [ ] Correlation ID tests
  - [ ] Test ID generation
  - [ ] Test ID propagation to events
  - [ ] Test timeline reconstruction

### Integration Tests
- [ ] Order creation integration test
  - [ ] POST /orders creates order
  - [ ] Returns order with generated number
  - [ ] ORDER_CREATED event created with correlation ID
- [ ] Order lifecycle integration test
  - [ ] Create order (pending)
  - [ ] Confirm order
  - [ ] Process order
  - [ ] Ship order
  - [ ] Deliver order
  - [ ] Verify all status events created
  - [ ] Verify correlation ID consistent
- [ ] Order cancellation integration test
  - [ ] Create and cancel order
  - [ ] Verify cannot cancel shipped order
  - [ ] ORDER_CANCELLED event created
- [ ] Order search integration test
  - [ ] Create multiple orders
  - [ ] Search by order number
  - [ ] Search by customer
  - [ ] Search by date range
  - [ ] Verify results match criteria
- [ ] Order proof integration test
  - [ ] Create and update order
  - [ ] Generate proof
  - [ ] Verify proof contains all events
  - [ ] Verify proof hash
- [ ] Order timeline integration test
  - [ ] Create order with multiple status changes
  - [ ] GET /orders/:id/timeline
  - [ ] Verify chronological order
  - [ ] Verify correlation ID in all events

### OpenAPI Documentation
- [ ] Document order creation endpoint
- [ ] Document order status update endpoint
- [ ] Document order retrieval endpoints
- [ ] Document order search parameters
- [ ] Document proof generation endpoint
- [ ] Add order examples (typical flow)
- [ ] Document status transition rules
- [ ] Document error codes and responses

---

## Contract Library Updates

### Order Contracts Creation
- [x] Create new `order-contracts` library
- [x] Create order creation schema (customer, items, addresses)
- [x] Add order item schema (sku, quantity, price, name)
- [x] Create order status enum
- [x] Add order update schema
- [x] Create order response schema
- [x] Add order search filter schema
- [x] Create order proof schema
- [x] Add order timeline event schema
- [x] Export all schemas from order-contracts index

### Shared Models Updates
- [x] Add Order type definition
- [x] Add OrderItem type definition
- [x] Add OrderStatus type definition
- [x] Add OrderProof type definition
- [x] Create order error types

---

## Frontend Orders Management

### Order Service
- [ ] Create order.service.ts in ledger-web
- [ ] Implement createOrder method
- [ ] Implement getOrders method (with filters)
- [ ] Implement getOrderById method
- [ ] Implement updateOrderStatus method
- [ ] Implement cancelOrder method
- [ ] Implement searchOrders method
- [ ] Implement getOrderTimeline method
- [ ] Implement getOrderProof method
- [ ] Add order state management

### Orders List Page
- [ ] Create orders-list.page.ts component
- [ ] Build orders table
  - [ ] Display order number, customer, status, total, date
  - [ ] Show status badges with colors
  - [ ] Add status filter dropdown
  - [ ] Add date range picker
  - [ ] Add search by order number/customer
  - [ ] Add sorting options
- [ ] Add pagination controls
- [ ] Display order count by status
- [ ] Add "Create Order" button
- [ ] Add export to CSV functionality

### Order Creation Form
- [ ] Create order-create.component.ts
- [ ] Build multi-step order form
  - [ ] Step 1: Customer information
  - [ ] Step 2: Order items (add/remove/edit)
  - [ ] Step 3: Shipping address
  - [ ] Step 4: Review and submit
- [ ] Implement item picker/autocomplete
- [ ] Calculate and display total automatically
- [ ] Validate all fields
- [ ] Handle creation errors
- [ ] Show success message with order number
- [ ] Navigate to order detail on success

### Order Detail View
- [ ] Create order-detail.page.ts component
- [ ] Display order information
  - [ ] Order number, status, dates
  - [ ] Customer information
  - [ ] Order items with quantities and prices
  - [ ] Total amount
  - [ ] Shipping and billing addresses
- [ ] Show order timeline with event history
- [ ] Add status update controls
  - [ ] Next status button (based on current status)
  - [ ] Cancel order button
  - [ ] Reason input for changes
- [ ] Display correlation ID for debugging
- [ ] Show proof download button
- [ ] Add print order button
- [ ] Show order completeness rail for customer, items, address, review, and proof readiness
- [ ] Show milestone badges derived from server order and ledger state

### Order Timeline Component
- [ ] Create order-timeline.component.ts
- [ ] Display chronological event list
  - [ ] Event type with icon
  - [ ] Timestamp
  - [ ] Actor who made the change
  - [ ] Reason/notes
  - [ ] Result (accepted/rejected/failed)
- [ ] Highlight current status
- [ ] Show visual timeline with connecting lines
- [ ] Add expand/collapse details
- [ ] Reuse shared timeline rail, status chip, trust seal, and event card primitives
- [ ] Add Angular animation trigger for timeline item entry with reduced-motion fallback
- [ ] Add unit tests for lifecycle rail, milestone badges, reduced-motion behavior, and no color-only status state

### Order Proof View
- [ ] Create order-proof.component.ts
- [ ] Display proof JSON (formatted)
- [ ] Show proof hash
- [ ] Add copy proof button
- [ ] Add download proof button
- [ ] Add verify proof button
- [ ] Display verification result
- [ ] Reuse shared proof hash card and proof verification trust seal
- [ ] Add unit tests for verified, failed, pending, empty, loading, and error proof states

### UI Integration
- [ ] Update navigation to highlight orders page
- [ ] Add order count badges
- [ ] Create order status color scheme
- [ ] Add order icons
- [ ] Implement real-time order updates (if WebSocket ready)

### Unit Tests
- [ ] Order service tests
  - [ ] Test order creation
  - [ ] Test order listing with filters
  - [ ] Test order status updates
  - [ ] Test order cancellation
  - [ ] Test proof generation
  - [ ] Test error handling
- [ ] Order component tests
  - [ ] Test order list rendering
  - [ ] Test order creation form validation
  - [ ] Test order detail display
  - [ ] Test timeline rendering
  - [ ] Test status updates
- [ ] Order form tests
  - [ ] Test multi-step navigation
  - [ ] Test item addition/removal
  - [ ] Test total calculation
  - [ ] Test validation

---

## E2E Testing (Playwright)

### Order Creation E2E Tests
- [ ] Test order creation flow
  - [ ] Navigate to orders page
  - [ ] Click "Create Order" button
  - [ ] Fill in customer information
  - [ ] Add order items
  - [ ] Fill in shipping address
  - [ ] Review and submit
  - [ ] Verify order created
  - [ ] Verify order appears in list
- [ ] Test order creation validation
  - [ ] Submit empty form
  - [ ] Verify validation errors
  - [ ] Fix errors and submit
  - [ ] Verify success

### Order Management E2E Tests
- [ ] Test order list filtering
  - [ ] Filter by status
  - [ ] Filter by date range
  - [ ] Search by order number
  - [ ] Search by customer name
  - [ ] Verify results match filters
- [ ] Test order status change
  - [ ] Navigate to order detail
  - [ ] Click "Confirm Order"
  - [ ] Verify status updated
  - [ ] Verify timeline shows event
- [ ] Test order lifecycle
  - [ ] Create new order
  - [ ] Confirm order
  - [ ] Mark as processing
  - [ ] Mark as shipped
  - [ ] Mark as delivered
  - [ ] Verify all statuses in timeline
- [ ] Test order cancellation
  - [ ] Navigate to pending order
  - [ ] Click cancel button
  - [ ] Enter cancellation reason
  - [ ] Confirm cancellation
  - [ ] Verify status is cancelled

### Order Proof E2E Tests
- [ ] Test proof generation
  - [ ] Navigate to order detail
  - [ ] Click "Generate Proof"
  - [ ] Verify proof displayed
  - [ ] Verify proof hash shown
- [ ] Test proof download
  - [ ] Generate proof
  - [ ] Click download
  - [ ] Verify file downloaded
- [ ] Test proof verification
  - [ ] Generate proof
  - [ ] Click verify
  - [ ] Verify validation result shown

### Order Timeline E2E Tests
- [ ] Test timeline display
  - [ ] Create order with multiple status changes
  - [ ] Navigate to order detail
  - [ ] Verify timeline shows all events
  - [ ] Verify chronological order
  - [ ] Verify current status highlighted

### Order Visual E2E Tests
- [ ] Test lifecycle rail displays every status transition with accessible labels
- [ ] Test proof hash card renders verified, failed, and pending states
- [ ] Test milestone badges derive from order and ledger state, not static client assumptions
- [ ] Test order cards and timeline remain readable on mobile, tablet, and desktop
- [ ] Test order completeness rail updates from server-backed form/detail state
- [ ] Test order timeline and proof animations remain usable with reduced motion enabled

---

## Documentation

### Technical Documentation
- [x] Document order lifecycle and status transitions
- [ ] Add order creation guide
- [x] Document proof generation process
- [x] Create correlation ID usage guide
- [ ] Document order search capabilities
- [ ] Add order API workflow diagrams
- [ ] Document order lifecycle rail, completeness rail, milestone badge, and proof indicator state model

### Integration Guides
- [ ] Create "Order Management Quick Start" guide
- [ ] Document partner order integration
- [ ] Add troubleshooting guide for order issues
- [ ] Create order payload examples
- [ ] Document proof verification process

### README Updates
- [x] Add order management setup instructions
- [ ] Document order environment variables
- [ ] Add order testing instructions
- [ ] Update architecture diagram with order flow

---

## Definition of Done

**Current local gate check:** 2026-06-05

Current completed slice:
- Created `libs/order-contracts` with schemas and exported types for creation, items, addresses, statuses, status updates, cancellation, search, timeline events, order detail responses, proofs, proof verification, examples, and order errors.
- Re-exported order contracts from `libs/shared-models`.
- Added shared-models unit tests covering schema-valid order examples, lifecycle statuses, ledger actions, and malformed status target rejection.
- Added initial order-management documentation and aligned README/API docs with the Sprint 3 contract foundation.

Local gate results:
- [x] `pnpm nx run shared-models:test --coverage --skip-nx-cache` - 13 tests passed
- [x] `pnpm nx run order-contracts:lint --skip-nx-cache`
- [x] `pnpm nx run shared-models:lint --skip-nx-cache`
- [x] `pnpm nx run order-contracts:build --skip-nx-cache`
- [x] `pnpm nx run shared-models:build --skip-nx-cache`

A task is considered complete when:
- [ ] Code written and follows coding standards
- [ ] Unit tests written and passing (90%+ coverage for new code)
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing (where applicable)
- [ ] Code reviewed and approved
- [ ] OpenAPI documentation updated
- [ ] Technical documentation updated
- [ ] No critical or high severity bugs
- [ ] Deployed to development environment and tested
- [ ] Demo-ready for sprint review

---

## Sprint Risks

### High Priority Risks
- **Order Number Collision:** Need guaranteed unique order numbers (mitigation: UUID or sequence with tenant prefix)
- **Status Transition Logic:** Complex state machine may have edge cases (mitigation: comprehensive tests)
- **Proof Generation Performance:** Large order history could slow proof generation (mitigation: index optimization)

### Medium Priority Risks
- **Correlation ID Propagation:** Must ensure all events get correct correlation ID (mitigation: service abstraction)
- **Order Search Performance:** Full-text search on large order count (mitigation: database indexes, caching)

---

## Sprint Retrospective Topics

- Order workflow intuitiveness
- Proof generation and verification UX
- Timeline visualization effectiveness
- Status transition validation approach
- Integration test coverage adequacy
- Frontend form usability

---

## Next Sprint Preview (Sprint 4: Inventory Module)

Key dependencies from Sprint 3:
- Order module must be complete
- Order ledger events working
- Order proofs functional
- Correlation ID tracking established

Sprint 4 will build on this foundation to add:
- Inventory item tracking
- Inventory operations with provenance
- Device scan integration for inventory
- Integration with orders for inventory reservation
