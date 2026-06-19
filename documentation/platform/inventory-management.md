# Inventory Management

Sprint 4 introduces tenant-scoped inventory tracking with ledger-backed provenance. The implemented vertical slice supports inventory creation, import, list/detail retrieval, reservations, movement, quantity/status changes, scan tracking, provenance, anomalies, alerts, and an Angular operations dashboard.

Implementation-oriented examples are documented in [Inventory Integration Guide](inventory-integration-guide.md). Operational failure handling is documented in [Inventory Troubleshooting](inventory-troubleshooting.md).

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

## Import Flow

`POST /api/v1/inventory/import` requires `inventory.write` and accepts 1 to 100 inventory item requests using the same shared schema as single-item creation.

Items are processed independently and return per-row results with the input index, SKU, success state, imported item, or rejection error. Accepted rows create normal `available` inventory records and append `INVENTORY_ADDED` ledger events. Rejected rows, such as duplicate tenant SKUs, do not block later rows in the same import.

The Angular inventory page provides a pasted JSON-array or CSV-row import panel. CSV input uses the headers `sku,name,locationId,locationName,quantity,unitOfMeasure` and supports optional creation fields through JSON input. The UI shows explicit imported/rejected result text for each row and reloads the list after completion.

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

## Inventory Dashboard

The Angular inventory dashboard summarizes the loaded tenant inventory view and refreshes as inventory operations reload the list. It shows total loaded items, item counts by status, top loaded locations, low-stock count, expiring-soon count, open anomaly count, active alert count, recent scans, and recent anomalies.

Dashboard health states use text labels and grouped metrics instead of color-only meaning:

- Low stock: active, non-removed items at or below `metadata.minimumQuantity`, defaulting to 5.
- Expiring soon: active items with expiration dates within 30 days.
- Open anomalies: currently loaded anomaly findings.
- Active alerts: currently loaded/generated alert findings.

The dashboard quick actions reuse the existing inventory page operations for refreshing inventory, generating ledger-backed alerts, and detecting ledger-backed anomalies.

## Detail Retrieval

`GET /api/v1/inventory/:id` and `GET /api/v1/inventory/sku/:sku` require `inventory.read`. Both endpoints return the full inventory record and scope lookup fields to the authenticated tenant. SKU lookup normalizes the supplied SKU to uppercase, and cross-tenant or unknown items return `404`. `GET /api/v1/inventory/:id?includeProvenance=true` returns the same item inside the provenance response shape with its chronological ledger timeline, reservation history, and scan history.

The Angular inventory page exposes a detail action for each item. The detail view shows description, status, location, available and reserved quantities, related reservation order, batch and serial numbers, expiration, scan timestamp, and creation/update timestamps. Opening details loads the item and provenance timeline through the combined detail response.

The detail view also exposes the same ledger-backed reserve, release, move, and remove operations available from the inventory table. Detail operations update the selected item state after completion so status, quantities, location, reservation, and removal fields remain consistent without closing the panel.

## Reservation Flow

`PATCH /api/v1/inventory/:id/reserve` requires `inventory.write`. It accepts a positive quantity, optional order UUID, and optional `timeoutMinutes` value up to 10,080 minutes. A reservation:

1. Confirms the item belongs to the authenticated tenant.
2. Rejects removed items, overlapping active reservations, and quantities above available stock.
3. Decrements available `quantity`, stores `reservedQuantity`, `reservationOrderId`, and `metadata.reservationExpiresAt` when a timeout is supplied, and sets status to `reserved`.
4. Appends an `INVENTORY_RESERVED` event with available quantity, reserved quantity, location, status, timeout, expiration, and order link.

`PATCH /api/v1/inventory/:id/release` restores the entire active reservation, clears the order link and expiration metadata, returns status to `available`, and appends `INVENTORY_RESERVATION_RELEASED`.

`POST /api/v1/inventory/reservations/release-expired` requires `inventory.write`. It scans reserved tenant inventory for expired `reservationExpiresAt` metadata, restores each expired reserved quantity, clears the reservation fields, and appends `INVENTORY_RESERVATION_RELEASED` with timeout provenance. The Angular inventory page displays reservation expiration values and provides a "Release expired reservations" action for operators or scheduled runners to trigger the release workflow.

## Movement Flow

`PATCH /api/v1/inventory/:id/move` requires `inventory.write` and accepts a destination location ID, destination name, and optional reason.

The move operation verifies tenant ownership, rejects removed items and no-op moves, preserves quantity/reservation/status state, updates the location, and appends `INVENTORY_MOVED`. The event records explicit from/to location objects, current quantities, status, reason, and the authenticated ledger actor.

`POST /api/v1/inventory/move/batch` requires `inventory.write` and accepts 1 to 100 inventory item IDs plus a destination location ID, destination name, and optional reason. Items are processed independently and return per-item results with the input index, item ID, success state, moved inventory item, or rejection error. Accepted moves append the same `INVENTORY_MOVED` provenance events as single-item moves, while rejected items do not block other moves in the batch.

The Angular inventory page provides a newline-delimited bulk move interface and shows explicit moved/rejected result text for each item. Validation against a future location registry remains planned.

## Quantity and Status Operations

`PATCH /api/v1/inventory/:id/quantity` requires `inventory.write` and accepts a non-negative final quantity plus a required reason. The operation verifies tenant ownership, rejects removed inventory, rejects quantities below the active reserved quantity, rejects no-op adjustments, and appends `INVENTORY_QUANTITY_ADJUSTED` with previous quantity, adjusted quantity, delta, reason, current location, and actor metadata.

`PATCH /api/v1/inventory/:id/status` requires `inventory.write` and accepts a target status plus a required reason. Direct changes to `reserved` and `removed` are rejected so callers must use the reservation and removal workflows. Items with active reserved quantity must be released before changing status. Accepted status changes append `INVENTORY_STATUS_CHANGED` with previous status, new status, reason, current quantity, location, and actor metadata.

The Angular inventory table and detail view expose these operations with explicit reason fields. Successful operations update the visible row/detail state and reload the current inventory page.

## Removal Flow

`DELETE /api/v1/inventory/:id` requires `inventory.write` and a non-empty removal reason.

The removal operation verifies tenant ownership, rejects reserved or already removed items, sets status to `removed`, zeros the available quantity, and stores the removal reason and timestamp. The inventory row is retained for audit history, and an `INVENTORY_REMOVED` event records the previous quantity, reason, removal time, and authenticated ledger actor. Hard deletion is intentionally not exposed.

## Scan Flow

`POST /api/v1/inventory/scan` accepts manual, barcode, QR, and RFID scans. Operators may use bearer authentication with `inventory.write`; registered devices may use `X-Device-Key` with `device.events.write`.

The scan value is resolved against SKU or serial number within the authenticated actor's tenant. A successful scan updates `last_scanned_at`, returns the inventory item, and appends `INVENTORY_SCANNED` with the scan type, scanned value, optional scanned location, timestamp, and device identity when a device submitted the scan. Unknown tenant inventory returns `404`.

When a scan supplies a location that differs from the item's current location, the API updates the scan timestamp, records a rejected `INVENTORY_SCANNED` event, records `INVENTORY_ANOMALY_DETECTED`, and returns `409`. The item exposes an `unexpected_location` anomaly and alert until a later scan confirms the current location. This uses the inventory item's current location as the authoritative expected location; validation against a separate location registry remains planned.

`POST /api/v1/inventory/scan/batch` accepts between 1 and 100 scans using the same bearer or device authentication. Scans are processed sequentially and return per-item results with the input index, scan value, success state, accepted inventory item, or rejection error. Successful scans remain persisted and ledger-recorded when another item in the batch is rejected.

The Angular inventory page provides single and newline-delimited bulk scan interfaces with explicit accepted or rejected text feedback. Scans validate the supplied location against the item's current location; wrong-location scans are rejected, ledger-recorded, and exposed as unexpected-location anomalies.

## Device Event Tracking

Devices may also submit `inventory.scan` events to `POST /api/v1/device-events` with `device.events.write`. The payload accepts the same scan identity fields used by inventory scans:

- `value`, `sku`, `serialNumber`, or `barcode` to identify the inventory item.
- `scanType`, defaulting to `barcode` when `barcode` is provided and `manual` otherwise.
- `locationId` to validate the scan location against the current inventory location.

The device event is recorded as a `DEVICE_EVENT_RECEIVED` ledger event and then drives the same inventory scan workflow used by `POST /api/v1/inventory/scan`. Accepted automated scans update `lastScannedAt` and append `INVENTORY_SCANNED` with device actor attribution. Provenance scan history shows the source event type so operators can distinguish direct inventory scans from device-event-driven scans.

## Provenance Flow

`GET /api/v1/inventory/:id/provenance` requires `inventory.read`. The endpoint verifies the inventory item belongs to the authenticated tenant, then reads its immutable inventory ledger events in chain-sequence order.

The response contains the current inventory item, a chronological event timeline, and derived reservation and scan histories. Each event includes its inventory action, actor and optional device identity, location, available and reserved quantities, timestamp, chain sequence, event hash, and complete event details. Reservation history contains reserve and release events; scan history contains accepted and rejected scans. Cross-tenant requests return `404`.

The Angular inventory page exposes a "View timeline" action for each item. The provenance panel reuses the shared timeline rail and ledger event cards to display chain-of-custody milestones with actor, location, quantity, hash, and sequence labels. It also displays reservation activity and accepted/rejected scan history.

## Inventory Visual State Model

The provenance panel derives a compact diagram model from the immutable provenance events and scan history. Each diagram entry includes movement state, actor, location, quantity, and anomaly state:

- Movement: added, reserved, released, moved, removed, accepted scan, rejected scan, or anomaly detected.
- Actor: event actor type and actor ID, including device actors for scan events.
- Location: event location name or location ID, with a fallback when no location was recorded.
- Quantity: event quantity with the inventory unit of measure.
- Anomaly state: rejected scans and anomaly-detected events render as `Anomaly`; other events render as `Clear`.

The location history diagram collapses consecutive duplicate locations into route steps. Each step shows location, movement that introduced the location, actor, and clear/anomaly state. Wrong-location rejected scans therefore appear as a distinct anomaly step when they differ from the previous known location.

Scan feedback uses explicit accepted/rejected text in both single and bulk scan flows. Single-scan feedback also uses a short CSS transition for accepted or rejected state; under `prefers-reduced-motion: reduce`, the animation is disabled while the accepted/rejected text and state styling remain visible. Anomaly cards use severity chips plus visible status and remediation text, so state does not depend on color alone.

## Anomaly Detection

`GET /api/v1/inventory/anomalies` requires `inventory.read` and computes open tenant-scoped findings without writing ledger events. It supports `type`, `severity`, `detectedFrom`, and `detectedTo` filters. Date filters use inclusive `YYYY-MM-DD` UTC day bounds and reject inverted ranges.

`POST /api/v1/inventory/anomalies/detect` requires `inventory.write`. It runs the same detection rules and appends an `INVENTORY_ANOMALY_DETECTED` ledger event for every finding.

Implemented rules:

- Low stock when available quantity is at or below `metadata.minimumQuantity`, defaulting to 5.
- Expired inventory when `expirationDate` is in the past.
- Damaged inventory that remains active.
- Missing scans when an item has not been scanned for at least 30 days.
- Unexpected scan location when the supplied scan location differs from the item's current location.
- Unexpected movement when `metadata.expectedLocationId` is set and differs from the current persisted location.
- Quantity discrepancy when `metadata.expectedQuantity` is a finite number and differs from the current persisted quantity.

Each anomaly includes a stable item/type ID, severity, open status, affected item and location, detection timestamp, explanatory message, remediation text, and rule details. The Angular inventory page renders anomaly cards using the shared severity chip with explicit severity, status, remediation labels, and type/severity/date filters. Operators can mark a loaded anomaly resolved in the current view; persisted resolution remains future backend work because no resolution endpoint exists yet.

Alert delivery and persisted anomaly resolution remain planned.

## Inventory Alerts

`GET /api/v1/inventory/alerts` requires `inventory.read` and returns current tenant-scoped alerts without writing ledger events. It supports `type` and `severity` filters.

`POST /api/v1/inventory/alerts/generate` requires `inventory.write`, returns the same current alerts, and appends an alert-specific ledger event for each finding. Low-stock alerts use each item's `metadata.minimumQuantity` threshold or default to 5. Expiring-soon alerts use `metadata.expirationAlertDays` or default to 30 days. Other detected inventory anomalies become anomaly alerts.

The Angular inventory page displays alert severity, affected item and location, message, and an explicit recommended action. Inventory success and error notifications, including alert generation, are delivered through in-app toaster notifications while retaining inline status text for accessible page context. External push/email delivery remains planned because the platform does not yet provide those notification transports.

## Error Responses

Inventory contracts define these domain error codes:

| Code | Typical HTTP status | Meaning |
| --- | --- | --- |
| `INVENTORY_INVALID_REQUEST` | `400` | Payload, filter, date range, pagination, or sort validation failed |
| `INVENTORY_NOT_FOUND` | `404` | Inventory item, SKU, provenance target, or tenant-scoped resource is absent |
| `INVENTORY_CONFLICT` | `409` | Duplicate SKU, over-reservation, no-op movement, removed item mutation, quantity conflict, or wrong-location scan |
| `INVENTORY_FORBIDDEN` | `403` | Caller lacks the required inventory permission |

Authentication failures return `401`. Rate-limited inventory writes return `429`. Device-originated scan authentication errors may also use device error codes documented in [Device Event Ingestion Guide](device-event-ingestion-guide.md).

## Current Scope

External push/email alert delivery, persisted anomaly resolution, location registry validation, reservation timeout background scheduling, and real-time inventory push updates remain planned future work.
