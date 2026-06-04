# Sprint 2: Device Management & Identity

**Sprint Duration:** 2 weeks (June 17 - June 30, 2026)  
**Sprint Goal:** Enable device registration, authentication, and event ingestion with proper identity and audit trails.
**Status:** Planned (not started as of 2026-06-04)

---

## Sprint Acceptance Criteria

- [ ] Devices can register with unique identity and receive scoped tokens
- [ ] Device authentication validates device tokens
- [ ] Device heartbeat endpoint tracks online/offline status
- [ ] Device events create ledger entries with device actor context
- [ ] Device dashboard includes status icons and heartbeat visual indicators
- [ ] Device revocation immediately blocks access
- [ ] Nonce validation prevents replay attacks
- [ ] Device status visible in admin UI

---

## Backend Device System

### Device Module Setup
- [ ] Generate `devices` module using NestJS CLI
- [ ] Generate devices controller and service
- [ ] Install device authentication dependencies

### Device Entity & Database
- [ ] Create Device entity with TypeORM
  - [ ] device_id (uuid, primary key)
  - [ ] device_name (string)
  - [ ] device_type (enum: scanner, printer, sensor, kiosk, gateway, tablet)
  - [ ] tenant_id (uuid)
  - [ ] api_key_hash (string) - hashed API key
  - [ ] public_key (text, nullable) - for future signature verification
  - [ ] status (enum: active, inactive, revoked, suspended)
  - [ ] last_seen_at (timestamp)
  - [ ] permissions (jsonb array)
  - [ ] metadata (jsonb)
  - [ ] created_at, updated_at, revoked_at
- [ ] Add indexes on tenant_id, status, device_type
- [ ] Create database migration

### Device Registration
- [ ] Implement POST /api/v1/devices/register endpoint
  - [ ] Validate device registration request
  - [ ] Generate unique device API key
  - [ ] Hash and store API key
  - [ ] Assign default device permissions
  - [ ] Create DEVICE_REGISTERED ledger event
  - [ ] Return device ID and API key (only shown once)
- [ ] Add registration rate limiting (prevent spam)
- [ ] Add tenant-scoped device creation
- [ ] Validate device name uniqueness within tenant

### Device Authentication
- [ ] Create DeviceAuthStrategy class
- [ ] Implement API key validation from header (X-Device-Key)
- [ ] Check device status (reject revoked/suspended devices)
- [ ] Load device permissions into request context
- [ ] Create DeviceAuthGuard extending AuthGuard
- [ ] Add device identification to all requests
- [ ] Create DEVICE_AUTH_FAILED ledger event on failure

### Device Heartbeat
- [ ] Implement POST /api/v1/devices/heartbeat endpoint
  - [ ] Require device authentication
  - [ ] Update last_seen_at timestamp
  - [ ] Accept optional status/metrics payload
  - [ ] Create DEVICE_HEARTBEAT ledger event
  - [ ] Return server timestamp
- [ ] Add heartbeat throttling (max once per minute per device)
- [ ] Track heartbeat failure count
- [ ] Auto-suspend devices after N failed heartbeats

### Device Status Endpoints
- [ ] Implement GET /api/v1/devices endpoint (list all devices)
  - [ ] Admin-only endpoint
  - [ ] Support filtering by status, type, tenant
  - [ ] Support pagination
  - [ ] Include last_seen_at in response
- [ ] Implement GET /api/v1/devices/:id/status
  - [ ] Return device status, last heartbeat, permissions
  - [ ] Calculate online/offline status (heartbeat < 5 min ago)
- [ ] Implement PATCH /api/v1/devices/:id/status
  - [ ] Admin-only
  - [ ] Allow status changes (active, suspended, revoked)
  - [ ] Create DEVICE_STATUS_CHANGED ledger event
- [ ] Implement DELETE /api/v1/devices/:id (revoke device)
  - [ ] Admin-only
  - [ ] Set status to revoked
  - [ ] Set revoked_at timestamp
  - [ ] Create DEVICE_REVOKED ledger event

### Device Event Ingestion
- [ ] Implement POST /api/v1/device-events endpoint
  - [ ] Require device authentication
  - [ ] Validate device event payload
  - [ ] Verify device permissions for event type
  - [ ] Create ledger event with device actor context
  - [ ] Include deviceId and deviceType in ledger event
  - [ ] Return event ID and server timestamp
- [ ] Implement POST /api/v1/device-events/batch
  - [ ] Accept array of device events
  - [ ] Process in transaction
  - [ ] Return batch results with success/failure per event
  - [ ] Create one ledger event per batch item
- [ ] Add device event rate limiting (per device)
- [ ] Validate event payload size limits

### Nonce & Replay Protection
- [ ] Create nonce tracking table or Redis cache
  - [ ] device_id, nonce_value, created_at
  - [ ] Unique constraint on (device_id, nonce_value)
- [ ] Add optional nonce parameter to device event endpoint
- [ ] Validate nonce uniqueness per device
- [ ] Expire nonces after 5 minutes (Redis TTL)
- [ ] Create REPLAY_ATTACK_DETECTED ledger event on duplicate nonce
- [ ] Add nonce to device event response for validation

### Device Ledger Events
- [ ] Create device event types in device-contracts
  - [ ] DEVICE_REGISTERED
  - [ ] DEVICE_AUTH_SUCCESS
  - [ ] DEVICE_AUTH_FAILED
  - [ ] DEVICE_HEARTBEAT
  - [ ] DEVICE_STATUS_CHANGED
  - [ ] DEVICE_REVOKED
  - [ ] DEVICE_EVENT_RECEIVED
  - [ ] REPLAY_ATTACK_DETECTED
- [ ] Ensure all device events include complete metadata
- [ ] Add device type and device ID to all events

### Unit Tests (Behavior Coverage)
- [ ] Device service tests
  - [ ] Test device registration
  - [ ] Test API key generation and validation
  - [ ] Test device status updates
  - [ ] Test device revocation
  - [ ] Test heartbeat processing
- [ ] Device auth strategy tests
  - [ ] Test valid API key authentication
  - [ ] Test invalid API key rejection
  - [ ] Test revoked device rejection
  - [ ] Test suspended device rejection
- [ ] Nonce validation tests
  - [ ] Test nonce acceptance
  - [ ] Test duplicate nonce rejection
  - [ ] Test nonce expiration
- [ ] Device event ingestion tests
  - [ ] Test single event ingestion
  - [ ] Test batch event ingestion
  - [ ] Test permission validation
  - [ ] Test rate limiting

### Integration Tests
- [ ] Device registration integration test
  - [ ] POST /devices/register creates device
  - [ ] Returns API key only once
  - [ ] DEVICE_REGISTERED event created
- [ ] Device authentication integration test
  - [ ] Request with valid API key succeeds
  - [ ] Request without API key returns 401
  - [ ] Request with revoked device key returns 401
  - [ ] DEVICE_AUTH_FAILED event created on failure
- [ ] Device heartbeat integration test
  - [ ] POST /devices/heartbeat updates last_seen_at
  - [ ] Returns server timestamp
  - [ ] DEVICE_HEARTBEAT event created
- [ ] Device event ingestion integration test
  - [ ] POST /device-events creates ledger event
  - [ ] Includes device actor context
  - [ ] Validates device permissions
- [ ] Batch device events integration test
  - [ ] POST /device-events/batch processes all events
  - [ ] Returns success/failure per event
  - [ ] Creates multiple ledger events
- [ ] Nonce replay protection integration test
  - [ ] First event with nonce succeeds
  - [ ] Duplicate nonce rejected
  - [ ] REPLAY_ATTACK_DETECTED event created
- [ ] Device revocation integration test
  - [ ] DELETE /devices/:id revokes device
  - [ ] Revoked device cannot authenticate
  - [ ] DEVICE_REVOKED event created

### OpenAPI Documentation
- [ ] Document device registration endpoint
- [ ] Document device authentication header requirement
- [ ] Document device event ingestion endpoints
- [ ] Document batch event format
- [ ] Add device examples for common hardware types
- [ ] Document error codes and responses

---

## Contract Library Updates

### Device Contracts Extension
- [ ] Create device registration schema (name, type, metadata)
- [ ] Add device API key response schema (id, api_key, created_at)
- [ ] Create device event schema (event_type, timestamp, payload, nonce)
- [ ] Add device batch event schema (array of events)
- [ ] Create device status enum (active, inactive, revoked, suspended)
- [ ] Add device type enum (scanner, printer, sensor, kiosk, gateway, tablet)
- [ ] Create device heartbeat schema (status, metrics)
- [ ] Add device permission enum
- [ ] Export all schemas from device-contracts index

### Shared Models Updates
- [ ] Add Device type definition
- [ ] Add DeviceEvent type definition
- [ ] Add DeviceStatus type definition
- [ ] Create device error types
- [ ] Add nonce validation error schema

---

## Frontend Device Management

### Device Service
- [ ] Create device.service.ts in ledger-web
- [ ] Implement registerDevice method
- [ ] Implement listDevices method (with filters)
- [ ] Implement getDeviceStatus method
- [ ] Implement updateDeviceStatus method
- [ ] Implement revokeDevice method
- [ ] Implement getDeviceEvents method
- [ ] Add device status observable (online/offline)

### Device Registry Page
- [ ] Expand existing `/devices` route module into a full device registry page
- [ ] Build device list table
  - [ ] Display device name, type, status, last seen
  - [ ] Show online/offline indicator (green/gray)
  - [ ] Add status filter dropdown
  - [ ] Add type filter dropdown
  - [ ] Add search by device name
- [ ] Add pagination controls
- [ ] Display device count by status
- [ ] Add refresh button for real-time updates

### Device Registration Form
- [ ] Create device-registration.component.ts
- [ ] Build registration form
  - [ ] Device name input (required)
  - [ ] Device type selector (dropdown)
  - [ ] Optional metadata JSON input
  - [ ] Permission checkboxes
  - [ ] Submit button
- [ ] Display generated API key (one-time display)
- [ ] Add copy-to-clipboard for API key
- [ ] Show security warning about API key storage
- [ ] Validate form inputs
- [ ] Handle registration errors

### Device Detail View
- [ ] Create device-detail.component.ts
- [ ] Display device information
  - [ ] Name, type, status
  - [ ] Created date, last seen
  - [ ] Online/offline status with timestamp
  - [ ] Assigned permissions
  - [ ] Metadata
- [ ] Show device event stream (last 50 events)
- [ ] Add revoke device button (with confirmation)
- [ ] Add suspend/activate device toggle
- [ ] Show device heartbeat history (last 24 hours)

### Device Status Management
- [ ] Create device-status.component.ts
- [ ] Add status change dropdown
- [ ] Implement status update confirmation dialog
- [ ] Show status change audit trail
- [ ] Display warning for critical status changes

### UI Integration
- [ ] Update navigation to highlight devices page
- [ ] Add device count badges (online/total)
- [ ] Create device online/offline visual indicators
- [ ] Add device icons for different types
- [ ] Reuse shared status chip, severity chip, trust seal, mission card, and empty state components from Sprint 1
- [ ] Add device fleet command board using shared MD3 surfaces and style tokens
- [ ] Add heartbeat sparkline or compact recency visual that includes non-color status text
- [ ] Add reliability seal derived from server heartbeat/revocation state
- [ ] Implement real-time status updates (if WebSocket ready)

### Unit Tests
- [ ] Device service tests
  - [ ] Test device registration
  - [ ] Test device listing
  - [ ] Test device status updates
  - [ ] Test device revocation
  - [ ] Test error handling
- [ ] Device component tests
  - [ ] Test device list rendering
  - [ ] Test registration form validation
  - [ ] Test device detail display
  - [ ] Test status updates
  - [ ] Test device fleet visual states for online, offline, suspended, revoked, empty, loading, and error
  - [ ] Test heartbeat visual exposes timestamp text and non-color status text
- [ ] Device form tests
  - [ ] Test input validation
  - [ ] Test API key display
  - [ ] Test copy-to-clipboard

---

## E2E Testing (Playwright)

### Device Registration E2E Tests
- [ ] Test device registration flow
  - [ ] Navigate to devices page
  - [ ] Click "Register Device" button
  - [ ] Fill in registration form
  - [ ] Submit form
  - [ ] Verify API key displayed
  - [ ] Verify device appears in list
- [ ] Test API key copy functionality
  - [ ] Register device
  - [ ] Click copy button
  - [ ] Verify clipboard contains API key

### Device Management E2E Tests
- [ ] Test device list filtering
  - [ ] Filter by status
  - [ ] Filter by type
  - [ ] Search by name
  - [ ] Verify results match filters
- [ ] Test device status change
  - [ ] Navigate to device detail
  - [ ] Change status to suspended
  - [ ] Verify status updated
  - [ ] Verify audit event created
- [ ] Test device revocation
  - [ ] Navigate to device detail
  - [ ] Click revoke button
  - [ ] Confirm revocation
  - [ ] Verify device status is revoked
  - [ ] Verify cannot unrevoke

### Device Audit Trail E2E Tests
- [ ] Test device event visibility
  - [ ] Register device
  - [ ] Submit device event via API (curl or script)
  - [ ] Navigate to device detail
  - [ ] Verify event visible in stream
- [ ] Test device audit trail
  - [ ] Register device
  - [ ] Change status
  - [ ] Revoke device
  - [ ] Navigate to ledger events
  - [ ] Verify all device events visible

### Device Visual E2E Tests
- [ ] Test device fleet board renders online, offline, suspended, and revoked visual states
- [ ] Test heartbeat visual includes timestamp text and does not rely on color alone
- [ ] Test device icons have accessible labels or adjacent text
- [ ] Test device empty/loading/error states reuse shared visual primitives
- [ ] Test device cards do not horizontally overflow or clip status/heartbeat text on mobile, tablet, or desktop

---

## Documentation

### Technical Documentation
- [ ] Document device registration process
- [ ] Add device authentication guide
- [ ] Document API key security best practices
- [ ] Create device event ingestion guide
- [ ] Document nonce replay protection
- [ ] Add device type definitions and use cases
- [ ] Document device fleet visual state model, heartbeat recency rules, and reliability seal source data

### Integration Guides
- [ ] Create "Device Integration Quick Start" guide
- [ ] Document device SDK examples (curl, Python, Node.js)
- [ ] Add troubleshooting guide for device authentication
- [ ] Create device event payload examples
- [ ] Document batch event best practices

### README Updates
- [ ] Add device management setup instructions
- [ ] Document device environment variables
- [ ] Add device testing instructions
- [ ] Update architecture diagram with device flow

---

## Definition of Done

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
- **API Key Management:** API keys shown only once - users may lose them (mitigation: allow regeneration with audit trail)
- **Device Scalability:** High-volume devices could overwhelm server (mitigation: aggressive rate limiting, batch endpoint)
- **Nonce Storage:** Redis nonce tracking could impact performance (mitigation: use TTL, benchmark early)

### Medium Priority Risks
- **Offline Devices:** Heartbeat-based detection may show false positives (mitigation: configurable timeout, grace period)
- **Permission Model:** Device permissions may need adjustment (mitigation: start simple, iterate based on feedback)

---

## Sprint Retrospective Topics

- Device authentication strategy effectiveness
- Nonce replay protection performance
- API key management user experience
- Device event ingestion throughput
- Frontend device management usability
- Test coverage adequacy

---

## Next Sprint Preview (Sprint 3: Orders Module)

Key dependencies from Sprint 2:
- Device authentication must be complete
- Device event ingestion working
- Device ledger events integrated
- Device management UI operational

Sprint 3 will build on this foundation to add:
- Order lifecycle management
- Order ledger integration
- Order proofs
- Integration with device events for order tracking
