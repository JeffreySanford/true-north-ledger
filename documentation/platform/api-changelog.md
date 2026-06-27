# API Changelog

This changelog tracks public REST API changes for True North Ledger.

## Versioning Strategy

- Public REST endpoints are versioned in the URL with `/api/v1/...`.
- The OpenAPI document version tracks the public API release version.
- Backward-compatible additions may be added to the current major version.
- Breaking request or response changes require a new major route prefix such as `/api/v2`.
- Deprecated endpoints must remain documented with a removal target before they are removed.
- Future migration guides will live in this document or linked version-specific files when a breaking version is introduced.

## v1.0.0

Initial PI-1 API release for authentication, audit ledger, devices, orders, inventory, proofs, health, readiness, and metrics.

### Endpoints

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api` | Basic API root status. |
| `GET` | `/api/health` | API health and dependency status. |
| `GET` | `/api/ready` | Readiness for orchestration checks. |
| `GET` | `/api/metrics` | Prometheus-formatted API metrics. |
| `POST` | `/api/v1/auth/login` | Authenticate a user and issue JWT tokens. |
| `POST` | `/api/v1/auth/refresh` | Refresh an access token. |
| `POST` | `/api/v1/auth/logout` | Revoke a refresh token. |
| `POST` | `/api/v1/auth/service-token` | Create a scoped service token. |
| `DELETE` | `/api/v1/auth/service-token/{id}` | Revoke a service token. |
| `POST` | `/api/v1/auth/users/{userId}/roles` | Assign tenant user roles. |
| `POST` | `/api/v1/auth/users/{userId}/deactivate` | Deactivate a tenant user. |
| `GET` | `/api/v1/ledger/events` | List tenant ledger events. |
| `GET` | `/api/v1/ledger/events/chain/verify` | Verify tenant ledger hash chain. |
| `GET` | `/api/v1/ledger/events/{id}` | Read one tenant ledger event. |
| `POST` | `/api/v1/ledger/events` | Append a server-audited ledger event. |
| `POST` | `/api/v1/ledger/events/append-override` | Append a rate-limited override ledger event. |
| `POST` | `/api/v1/devices/register` | Register a device and return its raw API key once. |
| `GET` | `/api/v1/devices` | List tenant devices. |
| `GET` | `/api/v1/devices/{id}/status` | Read device status and heartbeat state. |
| `PATCH` | `/api/v1/devices/{id}/status` | Update device status. |
| `DELETE` | `/api/v1/devices/{id}` | Revoke a device. |
| `POST` | `/api/v1/devices/heartbeat` | Record a device heartbeat using `X-Device-Key`. |
| `POST` | `/api/v1/device-events` | Ingest one device event. |
| `POST` | `/api/v1/device-events/batch` | Ingest a batch of device events. |
| `POST` | `/api/v1/orders` | Create a tenant order. |
| `GET` | `/api/v1/orders` | List tenant orders. |
| `GET` | `/api/v1/orders/search` | Search tenant orders. |
| `GET` | `/api/v1/orders/number/{orderNumber}` | Read an order by order number. |
| `GET` | `/api/v1/orders/{id}` | Read an order by id. |
| `PATCH` | `/api/v1/orders/{id}/status` | Transition order status. |
| `POST` | `/api/v1/orders/{id}/cancel` | Cancel an order. |
| `GET` | `/api/v1/orders/{id}/timeline` | Read order ledger timeline. |
| `GET` | `/api/v1/orders/{id}/proof` | Generate an order proof. |
| `POST` | `/api/v1/proofs/verify` | Verify an order proof hash. |
| `POST` | `/api/v1/inventory` | Add an inventory item. |
| `GET` | `/api/v1/inventory` | List inventory with filters and pagination. |
| `POST` | `/api/v1/inventory/import` | Import multiple inventory items. |
| `GET` | `/api/v1/inventory/anomalies` | List computed inventory anomalies. |
| `POST` | `/api/v1/inventory/anomalies/detect` | Detect anomalies and append ledger events. |
| `GET` | `/api/v1/inventory/alerts` | List computed inventory alerts. |
| `POST` | `/api/v1/inventory/alerts/generate` | Generate alerts and append ledger events. |
| `GET` | `/api/v1/inventory/sku/{sku}` | Read one inventory item by SKU. |
| `GET` | `/api/v1/inventory/{id}/provenance` | Read inventory provenance timeline. |
| `GET` | `/api/v1/inventory/{id}` | Read one inventory item by id. |
| `PATCH` | `/api/v1/inventory/{id}/reserve` | Reserve available inventory. |
| `PATCH` | `/api/v1/inventory/{id}/release` | Release an active reservation. |
| `POST` | `/api/v1/inventory/reservations/release-expired` | Release expired reservations. |
| `PATCH` | `/api/v1/inventory/{id}/move` | Move inventory to a new location. |
| `POST` | `/api/v1/inventory/move/batch` | Move multiple inventory items. |
| `PATCH` | `/api/v1/inventory/{id}/quantity` | Adjust inventory quantity. |
| `PATCH` | `/api/v1/inventory/{id}/status` | Change inventory status. |
| `DELETE` | `/api/v1/inventory/{id}` | Soft-remove inventory. |
| `POST` | `/api/v1/inventory/scan/batch` | Scan up to 100 inventory items. |
| `POST` | `/api/v1/inventory/scan` | Scan inventory by SKU or serial number. |

### Breaking Changes

None. This is the first public API release.

### Deprecations

None.

### Migration Guide

No migration is required for v1.0.0. Future migration guides will describe route changes, request/response changes, auth changes, rollout order, and rollback guidance for any breaking API version.
