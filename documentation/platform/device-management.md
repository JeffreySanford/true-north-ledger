# Device Management & Identity

Sprint 2 starts device identity with tenant-scoped registration, hashed device API keys, heartbeat tracking, status management, and auditable revocation.

## Identity Model

Devices are stored in the `devices` table with:

- `id`: UUID device identity.
- `tenant_id`: tenant ownership boundary.
- `device_name`: unique per tenant.
- `device_type`: `scanner`, `printer`, `sensor`, `kiosk`, `gateway`, or `tablet`.
- `api_key_hash`: SHA-256 hash of the raw API key. Raw keys are returned once at registration and are never persisted.
- `status`: `active`, `inactive`, `suspended`, or `revoked`.
- `last_seen_at`: server timestamp from the most recent accepted heartbeat.
- `heartbeat_failure_count`: consecutive degraded heartbeat count.
- `auto_suspended_at`: server timestamp when degraded heartbeat threshold enforcement suspended the device.
- `permissions`: scoped device permissions such as `device.heartbeat.write`.
- `metadata`: tenant-defined device metadata.
- `provisioning_payload_version`: version of the QR provisioning payload returned at registration.
- `last_provisioned_at`: server timestamp when the one-time provisioning payload was issued.

Device event replay protection is stored in `device_nonces` with:

- `device_id`: device identity that submitted the nonce.
- `nonce_value`: caller-provided idempotency/replay token.
- `created_at`: server timestamp used for the five-minute replay window.

## API Key Handling

`POST /api/v1/devices/register` returns the raw `tnl_dev_...` key once. Operators must store it in the target device or a secret manager immediately. The server keeps only the SHA-256 hash, so lost keys require future key rotation/regeneration rather than recovery.

The registration response also includes a one-time `provisioningPayload` and `provisioningUri` used by the web registry to render a QR code. The QR code encodes:

- device id, name, type, and tenant id
- the one-time raw API key
- heartbeat and device-event endpoint paths
- payload version and issue timestamp

The raw key and QR provisioning URI are not persisted. The database stores only `api_key_hash`, `provisioning_payload_version`, and `last_provisioned_at`.

In the web registry, the registration form is isolated in the device registration component. It validates required fields and metadata JSON, submits tenant-scoped device registrations, displays the one-time API key, renders the provisioning QR code, and exposes copy actions for both the raw key and provisioning URI.

Device-originated calls authenticate with:

```http
X-Device-Key: tnl_dev_example
```

The API uses a dedicated device-key authentication strategy to extract `X-Device-Key`, validate the hashed key, attach the device actor context, and capture source IP, user agent, and correlation id for audit events. Revoked or suspended devices are rejected before heartbeat state is updated.

## Endpoints

Admin/device-technician endpoints use bearer auth and RBAC permissions:

- `POST /api/v1/devices/register`: requires `devices.manage`; creates the device, stores a key hash, returns one-time key/QR provisioning data, and records `DEVICE_REGISTERED`.
- `GET /api/v1/devices`: requires `devices.read`; supports `status`, `type`, `search`, `page`, and `pageSize` filters. `page` is 1-based and `pageSize` is capped at 100.
- `GET /api/v1/devices/:id/status`: requires `devices.read`; returns status, permissions, last heartbeat, and derived online state.
- `PATCH /api/v1/devices/:id/status`: requires `devices.manage`; records `DEVICE_STATUS_CHANGED`.
- `DELETE /api/v1/devices/:id`: requires `devices.manage`; marks the device revoked, sets `revoked_at`, and records `DEVICE_REVOKED`.
- `POST /api/v1/devices/heartbeat`: requires `X-Device-Key`; updates `last_seen_at` and records `DEVICE_HEARTBEAT`.
- `POST /api/v1/device-events`: requires `X-Device-Key`; creates one `DEVICE_LEDGER_EVENT` with device actor context.
- `POST /api/v1/device-events/batch`: requires `X-Device-Key`; creates device ledger events transactionally and returns per-item results.

Device event JSON payloads are limited to 16 KiB per event. Batch requests are additionally limited to 64 KiB across all event payloads so oversized device submissions fail validation before ledger persistence.

Device write endpoints are route-scoped and device-scoped for throttling. Heartbeats allow one accepted write per device per minute. Device event endpoints use higher per-device limits and do not share the heartbeat bucket.

## Device Types And Examples

Supported device types are intentionally narrow so event streams remain auditable and searchable:

| Type | Common use case | Representative event |
| --- | --- | --- |
| `scanner` | Receiving dock barcode scans that confirm SKU, quantity, and station. | `inventory.scan` |
| `printer` | Shipping label print status and completion records. | `label.printed` |
| `sensor` | Environmental monitoring for cold-chain or high-value inventory. | `environment.temperature` |
| `kiosk` | Self-service receiving, pickup, or returns workflows. | `kiosk.return.accepted` |
| `gateway` | Edge gateway forwarding summarized downstream device activity. | `gateway.batch.summary` |
| `tablet` | Supervisor or mobile operations workflow decisions. | `workflow.approval` |

The canonical examples live in `DeviceHardwareExamples` from `@true-north-ledger/shared-models`. They are schema-validated in unit tests and used by OpenAPI request examples so docs, API contracts, and browser tests stay aligned.

## Nonce Replay Protection

Device event requests may include a `nonce` value. Accepted nonces are reserved per device for five minutes and echoed in the event response. Reusing the same nonce for the same device inside that window returns `409 Conflict` and records `REPLAY_ATTACK_DETECTED`.

Batch ingestion reserves each nonce inside the same database transaction as the ledger append. If any item has a duplicate nonce or append failure, the batch returns per-item failure results and rolls back accepted events from that batch.

## Online State

A device is considered online when:

- status is `active`
- `last_seen_at` exists
- the heartbeat is less than five minutes old

Devices may report heartbeat status as `online` or `degraded`. Online heartbeats reset `heartbeat_failure_count` to zero. Degraded heartbeats increment the consecutive failure count. After three consecutive degraded heartbeats, the API sets the device status to `suspended`, records `auto_suspended_at`, and appends `DEVICE_AUTO_SUSPENDED`. Suspended devices are rejected by future device-key authentication until an operator reactivates them.

The web registry shows the status, online/offline text, last heartbeat timestamp, and revocation state without relying on color alone. Registry pagination is server-backed so the browser displays the current page, total count, and previous/next controls from API metadata.

Each registry card links to `/devices/:id`, which displays:

- current status, online/offline heartbeat text, created timestamp, and device type
- heartbeat failure count and auto-suspended timestamp when applicable
- assigned permissions and tenant-defined metadata
- detail-level status changes with confirmation, critical-state warning text, and confirmation-based revocation
- a compact status audit trail for status changes, revocation, and auto-suspension events
- a last-24-hours heartbeat history derived from `DEVICE_HEARTBEAT` audit events, including reported heartbeat status and metrics
- the latest 50 device audit events derived from the tenant ledger stream by `deviceId`, subject id, or payload `deviceId`

The device detail view subscribes to `GET /api/v1/devices/:id/status` on a short polling cadence so operators see online/offline, heartbeat, and status changes without manually refreshing. This polling observable is the current production fallback and can be replaced by a WebSocket transport without changing the displayed state model.

## Auditability

Device lifecycle actions are appended as `DEVICE_LEDGER_EVENT` records through the existing ledger service. Each event includes:

- `deviceId`
- `deviceType`
- tenant metadata
- request/correlation metadata where available
- payload hash and append-only chain metadata

Auto-suspension is represented as `DEVICE_AUTO_SUSPENDED` with the previous status, new status, threshold, and failure count in the event payload.

## Remaining Sprint 2 Hardening

The next device slice should add:

- WebSocket transport upgrade for status updates
