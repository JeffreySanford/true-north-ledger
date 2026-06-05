# Sprint 2: Device Management & Identity

**Sprint Duration:** 2 weeks (June 17 - June 30, 2026)  
**Sprint Goal:** Enable device registration, authentication, and event ingestion with proper identity and audit trails.
**Status:** Implementation complete locally; pending code review approval and development-environment deployment testing.

---

## Sprint Acceptance Criteria

- [x] Devices can register with unique identity and receive scoped tokens
- [x] Device authentication validates device tokens
- [x] Device heartbeat endpoint tracks online/offline status
- [x] Device events create ledger entries with device actor context
- [x] Device dashboard includes status icons and heartbeat visual indicators
- [x] Device revocation immediately blocks access
- [x] Nonce validation prevents replay attacks
- [x] Device status visible in admin UI
- [x] Device registration displays a one-time QR provisioning code for device setup

---

## Backend Device System

### Device Module Setup
- [x] Generate `devices` module using NestJS CLI
- [x] Generate devices controller and service
- [x] Install device authentication dependencies (existing Passport/auth stack covers device-key strategy support)

### Device Entity & Database
- [x] Create Device entity with TypeORM
  - [x] device_id (uuid, primary key)
  - [x] device_name (string)
  - [x] device_type (enum: scanner, printer, sensor, kiosk, gateway, tablet)
  - [x] tenant_id (uuid)
  - [x] api_key_hash (string) - hashed API key
  - [x] public_key (text, nullable) - for future signature verification
  - [x] status (enum: active, inactive, revoked, suspended)
  - [x] last_seen_at (timestamp)
  - [x] permissions (jsonb array)
  - [x] metadata (jsonb)
  - [x] provisioning_payload_version and last_provisioned_at for non-secret provisioning audit metadata
  - [x] created_at, updated_at, revoked_at
- [x] Add indexes on tenant_id, status, device_type
- [x] Create database migration

### Device Registration
- [x] Implement POST /api/v1/devices/register endpoint
  - [x] Validate device registration request
  - [x] Generate unique device API key
  - [x] Hash and store API key
  - [x] Assign default device permissions
  - [x] Create DEVICE_REGISTERED ledger event
  - [x] Return device ID and API key (only shown once)
- [x] Return one-time provisioning payload and URI for QR-based device setup
- [x] Persist only non-secret provisioning metadata; raw API key remains one-time only
- [x] Add registration rate limiting (prevent spam)
- [x] Add tenant-scoped device creation
- [x] Validate device name uniqueness within tenant

### Device Authentication
- [x] Create DeviceAuthStrategy class
- [x] Implement API key validation from header (X-Device-Key)
- [x] Check device status (reject revoked/suspended devices)
- [x] Load device permissions into request context
- [x] Create DeviceAuthGuard for device endpoints
- [x] Add device identification to all requests
- [x] Create DEVICE_AUTH_FAILED ledger event on failure

### Device Heartbeat
- [x] Implement POST /api/v1/devices/heartbeat endpoint
  - [x] Require device authentication
  - [x] Update last_seen_at timestamp
  - [x] Accept optional status/metrics payload
  - [x] Create DEVICE_HEARTBEAT ledger event
  - [x] Return server timestamp
- [x] Add heartbeat throttling (max once per minute per device)
- [x] Track heartbeat failure count
- [x] Auto-suspend devices after N failed heartbeats

### Device Status Endpoints
- [x] Implement GET /api/v1/devices endpoint (list all devices)
  - [x] Admin-only endpoint
  - [x] Support filtering by status, type, tenant
  - [x] Support pagination
  - [x] Include last_seen_at in response
- [x] Implement GET /api/v1/devices/:id/status
  - [x] Return device status, last heartbeat, permissions
  - [x] Calculate online/offline status (heartbeat < 5 min ago)
- [x] Implement PATCH /api/v1/devices/:id/status
  - [x] Admin-only
  - [x] Allow status changes (active, suspended, revoked)
  - [x] Create DEVICE_STATUS_CHANGED ledger event
- [x] Implement DELETE /api/v1/devices/:id (revoke device)
  - [x] Admin-only
  - [x] Set status to revoked
  - [x] Set revoked_at timestamp
  - [x] Create DEVICE_REVOKED ledger event

### Device Event Ingestion
- [x] Implement POST /api/v1/device-events endpoint
  - [x] Require device authentication
  - [x] Validate device event payload
  - [x] Verify device permissions for event type
  - [x] Create ledger event with device actor context
  - [x] Include deviceId and deviceType in ledger event
  - [x] Return event ID and server timestamp
- [x] Implement POST /api/v1/device-events/batch
  - [x] Accept array of device events
  - [x] Process in transaction
  - [x] Return batch results with success/failure per event
  - [x] Create one ledger event per batch item
- [x] Add device event rate limiting (per device)
- [x] Validate event payload size limits

### Nonce & Replay Protection
- [x] Create nonce tracking table or Redis cache
  - [x] device_id, nonce_value, created_at
  - [x] Unique constraint on (device_id, nonce_value)
- [x] Add optional nonce parameter to device event endpoint
- [x] Validate nonce uniqueness per device
- [x] Expire nonces after 5 minutes (database cleanup before reservation)
- [x] Create REPLAY_ATTACK_DETECTED ledger event on duplicate nonce
- [x] Add nonce to device event response for validation

### Device Ledger Events
- [x] Create device event types in device-contracts
  - [x] DEVICE_REGISTERED
  - [x] DEVICE_AUTH_SUCCESS
  - [x] DEVICE_AUTH_FAILED
  - [x] DEVICE_HEARTBEAT
  - [x] DEVICE_STATUS_CHANGED
  - [x] DEVICE_REVOKED
  - [x] DEVICE_EVENT_RECEIVED
  - [x] REPLAY_ATTACK_DETECTED
- [x] Ensure all device events include complete metadata
- [x] Add device type and device ID to all events

### Unit Tests (Behavior Coverage)
- [x] Device service tests
  - [x] Test device registration
  - [x] Test API key generation and validation
  - [x] Test device status updates
  - [x] Test device revocation
  - [x] Test heartbeat processing
  - [x] Test degraded heartbeat failure tracking and auto-suspend
- [x] Device auth strategy tests
  - [x] Test valid API key authentication
  - [x] Test invalid API key rejection
  - [x] Test revoked device rejection
  - [x] Test suspended device rejection
- [x] Nonce validation tests
  - [x] Test nonce acceptance
  - [x] Test duplicate nonce rejection
  - [x] Test nonce expiration
- [x] Device event ingestion tests
  - [x] Test single event ingestion
  - [x] Test batch event ingestion
  - [x] Test permission validation
  - [x] Test rate limiting
  - [x] Test payload size validation

### Integration Tests
- [x] Device registration integration test
  - [x] POST /devices/register creates device
  - [x] Returns API key only once
  - [x] DEVICE_REGISTERED event created
- [x] Device authentication integration test
  - [x] Request with valid API key succeeds
  - [x] Request without API key returns 401
  - [x] Request with revoked device key returns 401
  - [x] DEVICE_AUTH_FAILED event created on failure
- [x] Device heartbeat integration test
  - [x] POST /devices/heartbeat updates last_seen_at
  - [x] Returns server timestamp
  - [x] DEVICE_HEARTBEAT event created
  - [x] Consecutive degraded heartbeats auto-suspend the device
- [x] Device event ingestion integration test
  - [x] POST /device-events creates ledger event
  - [x] Includes device actor context
  - [x] Validates device permissions
- [x] Batch device events integration test
  - [x] POST /device-events/batch processes all events
  - [x] Returns success/failure per event
  - [x] Creates multiple ledger events
- [x] Nonce replay protection integration test
  - [x] First event with nonce succeeds
  - [x] Duplicate nonce rejected
  - [x] REPLAY_ATTACK_DETECTED event created
- [x] Device revocation integration test
  - [x] DELETE /devices/:id revokes device
  - [x] Revoked device cannot authenticate
  - [x] DEVICE_REVOKED event created

### OpenAPI Documentation
- [x] Document device registration endpoint
- [x] Document device authentication header requirement
- [x] Document device event ingestion endpoints
- [x] Document batch event format
- [x] Document QR provisioning response payload
- [x] Add device examples for common hardware types
- [x] Document error codes and responses

---

## Contract Library Updates

### Device Contracts Extension
- [x] Create device registration schema (name, type, metadata)
- [x] Add device API key response schema (id, api_key, created_at)
- [x] Add device provisioning payload schema for QR setup
- [x] Create device event schema (event_type, timestamp, payload, nonce)
- [x] Add device batch event schema (array of events)
- [x] Create device status enum (active, inactive, revoked, suspended)
- [x] Add device type enum (scanner, printer, sensor, kiosk, gateway, tablet)
- [x] Create device heartbeat schema (status, metrics)
- [x] Add device permission enum
- [x] Export all schemas from device-contracts index

### Shared Models Updates
- [x] Add Device type definition
- [x] Add DeviceEvent type definition
- [x] Add DeviceStatus type definition
- [x] Create device error types
- [x] Add nonce validation error schema

---

## Frontend Device Management

### Device Service
- [x] Create device.service.ts in ledger-web
- [x] Implement registerDevice method
- [x] Implement listDevices method (with filters)
- [x] Implement getDeviceStatus method
- [x] Implement updateDeviceStatus method
- [x] Implement revokeDevice method
- [x] Implement getDeviceEvents method
- [x] Add device status observable (online/offline)

### Device Registry Page
- [x] Expand existing `/devices` route module into a full device registry page
- [x] Build device list table
  - [x] Display device name, type, status, last seen
  - [x] Show online/offline indicator (green/gray)
  - [x] Add status filter dropdown
  - [x] Add type filter dropdown
  - [x] Add search by device name
- [x] Add pagination controls
- [x] Display device count by status
- [x] Add refresh button for real-time updates

### Device Registration Form
- [x] Create device-registration.component.ts
- [x] Build registration form
  - [x] Device name input (required)
  - [x] Device type selector (dropdown)
  - [x] Optional metadata JSON input
  - [x] Permission checkboxes
  - [x] Submit button
- [x] Display generated API key (one-time display)
- [x] Display one-time QR provisioning code beside API key
- [x] Add copy-to-clipboard for QR provisioning payload
- [x] Add copy-to-clipboard for API key
- [x] Show security warning about API key storage
- [x] Validate form inputs
- [x] Handle registration errors

### Device Detail View
- [x] Create device-detail.component.ts
- [x] Display device information
  - [x] Name, type, status
  - [x] Created date, last seen
  - [x] Online/offline status with timestamp
  - [x] Assigned permissions
  - [x] Metadata
- [x] Show device event stream (last 50 events)
- [x] Add revoke device button (with confirmation)
- [x] Add suspend/activate device toggle
- [x] Show device heartbeat history (last 24 hours)

### Device Status Management
- [x] Create device-status.component.ts
- [x] Add status change dropdown
- [x] Implement status update confirmation dialog
- [x] Show status change audit trail
- [x] Display warning for critical status changes

### UI Integration
- [x] Update navigation to highlight devices page
- [x] Add device count badges (online/total)
- [x] Create device online/offline visual indicators
- [x] Add device icons for different types
- [x] Reuse shared status chip, severity chip, trust seal, mission card, and empty state components from Sprint 1
- [x] Add device fleet command board using shared MD3 surfaces and style tokens
- [x] Add heartbeat sparkline or compact recency visual that includes non-color status text
- [x] Add reliability seal derived from server heartbeat/revocation state
- [x] Implement real-time status updates with polling fallback until WebSocket transport is ready

### Unit Tests
- [x] Device service tests
  - [x] Test device registration
  - [x] Test device listing
  - [x] Test device status updates
  - [x] Test device status observable polling
  - [x] Test device revocation
  - [x] Test error handling
- [x] Device component tests
  - [x] Test device list rendering
  - [x] Test registration form validation
  - [x] Test device detail display
  - [x] Test device detail heartbeat history filters to the last 24 hours
  - [x] Test device detail auto-suspension diagnostics
  - [x] Test device detail live status updates from observable
  - [x] Test device status management confirmation, warning, disabled, and audit trail states
  - [x] Test status updates
  - [x] Test device fleet visual states for online, offline, suspended, revoked, empty, loading, and error
  - [x] Test heartbeat visual exposes timestamp text and non-color status text
- [x] Device form tests
  - [x] Test input validation
  - [x] Test API key display
  - [x] Test QR provisioning code display
  - [x] Test copy-to-clipboard
  - [x] Test extracted registration component submit, metadata validation, API errors, QR, and copy behavior

---

## E2E Testing (Playwright)

### Device Registration E2E Tests
- [x] Test device registration flow
  - [x] Navigate to devices page
  - [x] Click "Register Device" button
  - [x] Fill in registration form
  - [x] Submit form
  - [x] Verify API key displayed
  - [x] Verify QR provisioning code displayed
  - [x] Verify device appears in list
- [x] Test registration failure surfaces API error message in UI
- [x] Test API key copy functionality
  - [x] Register device
  - [x] Click copy button
  - [x] Verify clipboard contains API key

### Device Management E2E Tests
- [x] Test device list filtering
  - [x] Filter by status
  - [x] Filter by type
  - [x] Search by name
  - [x] Verify results match filters
- [x] Test device list pagination
  - [x] Navigate pages with Previous and Next controls
  - [x] Verify API receives page and pageSize query parameters
  - [x] Verify result counts and summaries match server metadata
- [x] Test device status change
  - [x] Navigate to device detail
  - [x] Change status to suspended from registry card
  - [x] Change status to suspended from detail page
  - [x] Confirm critical detail-page status changes
  - [x] Verify status updated in registry UI
  - [x] Verify status updated in detail UI
  - [x] Verify audit event visible in detail event stream
  - [x] Verify status change audit trail visible in detail status controls
- [x] Test device revocation
  - [x] Navigate to device detail
  - [x] Click revoke button from registry card
  - [x] Click revoke button from detail page
  - [x] Confirm revocation
  - [x] Verify device status is revoked
  - [x] Verify cannot unrevoke from disabled registry controls
  - [x] Verify cannot unrevoke from disabled detail controls

### Device Event Ingestion API E2E Tests
- [x] Test single device event ingestion with device-key authentication
  - [x] Verify missing device key is rejected with 401
- [x] Test batch device event ingestion with device-key authentication

### Device Audit Trail E2E Tests
- [x] Test device event visibility
  - [x] Register device
  - [x] Submit device event via API (curl or script)
  - [x] Navigate to device detail
  - [x] Verify event visible in stream
- [x] Test device audit trail
  - [x] Register device
  - [x] Change status
  - [x] Revoke device
  - [x] Navigate to ledger events
  - [x] Verify all device events visible

### Device Visual E2E Tests
- [x] Test device fleet board renders online, offline, suspended, and revoked visual states
- [x] Test heartbeat visual includes timestamp text and does not rely on color alone
- [x] Test device detail heartbeat history includes recent heartbeat metrics and status text
- [x] Test device detail displays heartbeat failure count and auto-suspended timestamp
- [x] Test device detail live status polling updates visible online/offline state
- [x] Test device icons have accessible labels or adjacent text
- [x] Test registration QR code has accessible labeling
- [x] Test device empty/loading/error states reuse shared visual primitives
- [x] Test device cards do not horizontally overflow or clip status/heartbeat text on mobile, tablet, or desktop

---

## Documentation

### Technical Documentation
- [x] Document device registration process
- [x] Add device authentication guide
- [x] Document API key security best practices
- [x] Document one-time QR provisioning flow and database handling
- [x] Create device event ingestion guide
- [x] Document nonce replay protection
- [x] Add device type definitions and use cases
- [x] Document device fleet visual state model, heartbeat recency rules, and reliability seal source data

### Integration Guides
- [x] Create "Device Integration Quick Start" guide
- [x] Document device SDK examples (curl, Python, Node.js)
- [x] Add troubleshooting guide for device authentication
- [x] Create device event payload examples
- [x] Document batch event best practices

### README Updates
- [x] Add device management setup instructions
- [x] Document device environment variables
- [x] Add device testing instructions
- [x] Update architecture diagram with device flow

---

## Definition of Done

**Current local gate check:** 2026-06-05

A task is considered complete when:
- [x] Code written and follows coding standards
- [x] Unit tests written and passing (90%+ coverage for new code)
- [x] Integration tests written and passing
- [x] E2E tests written and passing (where applicable)
- [ ] Code reviewed and approved
- [x] OpenAPI documentation updated
- [x] Technical documentation updated
- [x] No critical or high severity bugs
- [ ] Deployed to development environment and tested
- [x] Demo-ready for sprint review

Current completed slice:
- Device registration, extracted registration component, formal device-key auth strategy, heartbeat, degraded-heartbeat failure tracking with auto-suspend, per-device route throttling, revocation, device event ingestion, batch device event ingestion, nonce replay protection, payload size validation, admin device registry UI, QR provisioning, clipboard verification, device filtering, server-backed pagination, registry-level status/revocation controls, device detail status/audit views, status-management confirmation and audit trail controls, ledger-events audit visibility, device event visibility from registration through ingestion to detail stream, shared-primitives device empty/loading/error states, hardware examples, integration docs, last-24-hours heartbeat history, and polling-backed live device status updates are implemented and locally verified.
- Remaining Sprint 2 closeout still includes code review approval and development-environment deployment testing.
- WebSocket transport remains a planned Sprint 5 upgrade; Sprint 2 uses polling-backed live status updates.

Local gate results:
- [x] `pnpm nx run-many -t lint --skip-nx-cache` - 8 projects passed
- [x] `pnpm nx run-many -t test --coverage --skip-nx-cache` - shared-models 10 tests, ledger-api 171 tests, ledger-web 116 tests; web statements 92.17%, functions 90.9%, lines 94.14%
- [x] `pnpm nx run-many -t build --skip-nx-cache` - 7 projects passed
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache` - 454 passed, 16 skipped
- [x] `pnpm audit --audit-level moderate` - no known vulnerabilities

Latest continuation validation:
- [x] `pnpm nx run ledger-api:test --coverage --skip-nx-cache --testPathPatterns=device-auth`
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache`
- [x] `pnpm nx run ledger-api:test --coverage --skip-nx-cache`
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "ingests a device event with device-key authentication"`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "defaults to sessionStorage"`
- [x] `pnpm nx run ledger-web:test --coverage --skip-nx-cache --include apps/ledger-web/src/app/pages/devices/device-status.component.spec.ts --include apps/ledger-web/src/app/pages/devices/device-detail.component.spec.ts`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device detail shows"`
- [x] `pnpm nx run ledger-web:test --coverage --skip-nx-cache --include apps/ledger-web/src/app/pages/devices/device-registration.component.spec.ts --include apps/ledger-web/src/app/pages/devices/devices.component.spec.ts`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device registry (registers|copies|surfaces registration)"`
- [x] `pnpm nx run ledger-web:test --coverage --skip-nx-cache --include apps/ledger-web/src/app/pages/devices/devices.component.spec.ts --include apps/ledger-web/src/app/pages/ledger-events/ledger-events.component.spec.ts`
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device audit trail shows"`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- apps/ledger-web-e2e/src/devices.spec.ts`
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache`
- [x] `pnpm nx run ledger-web:test --coverage --skip-nx-cache --include apps/ledger-web/src/app/pages/devices/devices.component.spec.ts`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "shared visual primitives"`
- [x] `pnpm nx run ledger-web:test --coverage --skip-nx-cache --include apps/ledger-web/src/app/pages/devices/device-detail.component.spec.ts`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device event visibility starts"`
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- apps/ledger-web-e2e/src/devices.spec.ts`
- [x] `pnpm nx run shared-models:test --coverage --skip-nx-cache`
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache`
- [x] `pnpm nx run shared-models:build --skip-nx-cache`
- [x] `pnpm nx run ledger-api:build --skip-nx-cache`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- apps/ledger-web-e2e/src/devices.spec.ts`
- [x] `pnpm nx run-many -t lint --skip-nx-cache`
- [x] `pnpm nx run-many -t test --coverage --skip-nx-cache`
- [x] `pnpm nx run-many -t build --skip-nx-cache`
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache`
- [x] `pnpm audit --audit-level moderate`

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
