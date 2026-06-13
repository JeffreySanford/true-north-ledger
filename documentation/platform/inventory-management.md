# Inventory Management

Sprint 4 introduces tenant-scoped inventory tracking with ledger-backed provenance. The initial vertical slice supports adding inventory and listing it with filters, sorting, and pagination.

## Data Model

Each inventory item has a UUID primary key and a SKU that is unique within its tenant. Items record their name, description, location, quantity, unit of measure, lifecycle status, optional batch/serial/expiration fields, metadata, timestamps, and last scan time.

The database indexes tenant, SKU, location, status, batch number, and the combined tenant/location/status query path. Quantity is constrained to a non-negative integer.

## Addition Flow

`POST /api/v1/inventory` requires `inventory.write`.

1. The request is validated with the shared `inventory-contracts` schema.
2. The SKU is normalized to uppercase and enforced as unique within the tenant.
3. The item is created with `available` status and its initial location.
4. An `INVENTORY_ADDED` ledger event records SKU, name, location, quantity, unit, and status.
5. The persisted inventory item is returned.

Inventory addition is rate limited to 30 requests per minute per authenticated actor.

## List Flow

`GET /api/v1/inventory` requires `inventory.read` and always scopes results to the authenticated tenant.

Supported query parameters:

- `locationId`
- `status`
- `query` for SKU or name
- `page` and `pageSize`
- `sortBy`: `quantity`, `lastScannedAt`, or `createdAt`
- `sortDirection`: `asc` or `desc`

The Angular inventory page exposes the same filters, adds inventory, shows status counts, and labels low-stock items in text so the warning does not rely on color alone.

## Detail Retrieval

`GET /api/v1/inventory/:id` and `GET /api/v1/inventory/sku/:sku` require `inventory.read`. Both endpoints return the full inventory record and scope lookup fields to the authenticated tenant. SKU lookup normalizes the supplied SKU to uppercase, and cross-tenant or unknown items return `404`.

The Angular inventory page exposes a detail action for each item. The detail view shows description, status, location, available and reserved quantities, related reservation order, batch and serial numbers, expiration, scan timestamp, and creation/update timestamps. Opening details also loads the item's provenance timeline.

## Reservation Flow

`PATCH /api/v1/inventory/:id/reserve` requires `inventory.write`. It accepts a positive quantity and an optional order UUID. A reservation:

1. Confirms the item belongs to the authenticated tenant.
2. Rejects removed items, overlapping active reservations, and quantities above available stock.
3. Decrements available `quantity`, stores `reservedQuantity` and `reservationOrderId`, and sets status to `reserved`.
4. Appends an `INVENTORY_RESERVED` event with available quantity, reserved quantity, location, status, and order link.

`PATCH /api/v1/inventory/:id/release` restores the entire active reservation, clears the order link, returns status to `available`, and appends `INVENTORY_RESERVATION_RELEASED`. Reservation timeout remains planned.

## Movement Flow

`PATCH /api/v1/inventory/:id/move` requires `inventory.write` and accepts a destination location ID, destination name, and optional reason.

The move operation verifies tenant ownership, rejects removed items and no-op moves, preserves quantity/reservation/status state, updates the location, and appends `INVENTORY_MOVED`. The event records explicit from/to location objects, current quantities, status, reason, and the authenticated ledger actor.

Bulk movement and validation against a future location registry remain planned.

## Removal Flow

`DELETE /api/v1/inventory/:id` requires `inventory.write` and a non-empty removal reason.

The removal operation verifies tenant ownership, rejects reserved or already removed items, sets status to `removed`, zeros the available quantity, and stores the removal reason and timestamp. The inventory row is retained for audit history, and an `INVENTORY_REMOVED` event records the previous quantity, reason, removal time, and authenticated ledger actor. Hard deletion is intentionally not exposed.

## Scan Flow

`POST /api/v1/inventory/scan` accepts manual, barcode, QR, and RFID scans. Operators may use bearer authentication with `inventory.write`; registered devices may use `X-Device-Key` with `device.events.write`.

The scan value is resolved against SKU or serial number within the authenticated actor's tenant. A successful scan updates `last_scanned_at`, returns the inventory item, and appends `INVENTORY_SCANNED` with the scan type, scanned value, optional scanned location, timestamp, and device identity when a device submitted the scan. Unknown tenant inventory returns `404`.

The Angular inventory page provides a manual scan interface and explicit accepted or rejected text feedback. Bulk scanning, location-match validation, and anomaly detection remain planned.

## Provenance Flow

`GET /api/v1/inventory/:id/provenance` requires `inventory.read`. The endpoint verifies the inventory item belongs to the authenticated tenant, then reads its immutable inventory ledger events in chain-sequence order.

The response contains the current inventory item and a chronological event timeline. Each event includes its inventory action, actor and optional device identity, location, available and reserved quantities, timestamp, chain sequence, event hash, and complete event details. Cross-tenant requests return `404`.

The Angular inventory page exposes a "View timeline" action for each item. The provenance panel reuses the shared timeline rail and ledger event cards to display chain-of-custody milestones with actor, location, quantity, hash, and sequence labels.

## Anomaly Detection

`GET /api/v1/inventory/anomalies` requires `inventory.read` and computes open tenant-scoped findings without writing ledger events. It supports `type` and `severity` filters.

`POST /api/v1/inventory/anomalies/detect` requires `inventory.write`. It runs the same detection rules and appends an `INVENTORY_ANOMALY_DETECTED` ledger event for every finding.

Implemented rules:

- Low stock when available quantity is at or below `metadata.minimumQuantity`, defaulting to 5.
- Expired inventory when `expirationDate` is in the past.
- Damaged inventory that remains active.
- Missing scans when an item has not been scanned for at least 30 days.

Each anomaly includes a stable item/type ID, severity, open status, affected item and location, detection timestamp, explanatory message, remediation text, and rule details. The Angular inventory page renders anomaly cards using the shared severity chip with explicit severity, status, and remediation labels.

Unexpected-location and quantity-discrepancy rules require authoritative expected-location and quantity sources and remain planned. Alert delivery and anomaly resolution are also planned.

## Inventory Alerts

`GET /api/v1/inventory/alerts` requires `inventory.read` and returns current tenant-scoped alerts without writing ledger events. It supports `type` and `severity` filters.

`POST /api/v1/inventory/alerts/generate` requires `inventory.write`, returns the same current alerts, and appends an alert-specific ledger event for each finding. Low-stock alerts use each item's `metadata.minimumQuantity` threshold or default to 5. Expiring-soon alerts use `metadata.expirationAlertDays` or default to 30 days. Other detected inventory anomalies become anomaly alerts.

The Angular inventory page displays alert severity, affected item and location, message, and an explicit recommended action. External notification delivery remains planned because the platform does not yet provide a notification subsystem.

## Current Scope

External alert delivery, anomaly resolution, reservation timeout, bulk scanning and movement, location registry validation, scan history, and real-time inventory updates remain planned Sprint 4 increments.
