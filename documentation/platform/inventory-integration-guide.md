# Inventory Integration Guide

This guide shows how service clients and operators integrate with the tenant-scoped inventory API. For the domain model and UI behavior, see [Inventory Management](inventory-management.md).

## Prerequisites

- Run the local stack with `pnpm start:all`.
- Authenticate as a user or service token with `inventory.read` and `inventory.write`.
- Use `Authorization: Bearer <access-token>` for operator and service calls.
- Use `X-Device-Key` only for device-originated scan calls. Device key setup is covered in [Device Event Ingestion Guide](device-event-ingestion-guide.md).

## Add Inventory

`POST /api/v1/inventory` creates one inventory item and records `INVENTORY_ADDED`.

```sh
curl -X POST http://localhost:3000/api/v1/inventory \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "SKU-100",
    "name": "Serialized sensor kit",
    "description": "Warehouse sensor kit with serialized components",
    "locationId": "AUSTIN-A1",
    "locationName": "Austin Warehouse - Aisle A1",
    "quantity": 25,
    "unitOfMeasure": "each",
    "batchNumber": "LOT-42",
    "serialNumber": "SNS-100-001",
    "expirationDate": "2027-06-30",
    "metadata": {
      "minimumQuantity": 5,
      "expirationAlertDays": 30
    }
  }'
```

SKUs are normalized to uppercase and must be unique within the authenticated tenant.

## Import Inventory

`POST /api/v1/inventory/import` accepts 1 to 100 item requests and returns per-row results. Successful rows create normal inventory items and ledger events. Rejected rows do not block later rows.

```sh
curl -X POST http://localhost:3000/api/v1/inventory/import \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "sku": "SKU-101",
        "name": "Replacement sensor",
        "locationId": "AUSTIN-A1",
        "locationName": "Austin Warehouse - Aisle A1",
        "quantity": 10,
        "unitOfMeasure": "each"
      },
      {
        "sku": "SKU-102",
        "name": "Tamper-evident seal pack",
        "locationId": "AUSTIN-B2",
        "locationName": "Austin Warehouse - Aisle B2",
        "quantity": 50,
        "unitOfMeasure": "pack"
      }
    ]
  }'
```

The web import panel also accepts pasted CSV rows with these headers:

```csv
sku,name,locationId,locationName,quantity,unitOfMeasure
SKU-101,Replacement sensor,AUSTIN-A1,Austin Warehouse - Aisle A1,10,each
```

## List and Retrieve

`GET /api/v1/inventory` returns tenant-scoped inventory with optional filters:

- `locationId`
- `status`
- `query` for SKU or name
- `page` and `pageSize`
- `sortBy`: `quantity`, `lastScannedAt`, or `createdAt`
- `sortDirection`: `asc` or `desc`

```sh
curl "http://localhost:3000/api/v1/inventory?query=SKU&sortBy=createdAt&sortDirection=desc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Use `GET /api/v1/inventory/:id`, `GET /api/v1/inventory/sku/:sku`, or `GET /api/v1/inventory/:id?includeProvenance=true` for item detail. The combined provenance response includes the current item, ledger timeline, reservation history, and scan history.

## Reserve and Release

Reserve available inventory with `PATCH /api/v1/inventory/:id/reserve`.

```sh
curl -X PATCH http://localhost:3000/api/v1/inventory/$ITEM_ID/reserve \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 2,
    "orderId": "22222222-2222-4222-8222-222222222222",
    "timeoutMinutes": 60
  }'
```

Release the active reservation with `PATCH /api/v1/inventory/:id/release`.

Expired reservations can be released by an operator or scheduled runner:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/reservations/release-expired \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The endpoint is implemented, but background scheduling remains future job-runner work.

## Move, Adjust, and Remove

Move one item:

```sh
curl -X PATCH http://localhost:3000/api/v1/inventory/$ITEM_ID/move \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "AUSTIN-B2",
    "locationName": "Austin Warehouse - Aisle B2",
    "reason": "Cycle count relocation"
  }'
```

Bulk move up to 100 items:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/move/batch \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "itemIds": ["55555555-5555-4555-8555-555555555555"],
    "locationId": "AUSTIN-C3",
    "locationName": "Austin Warehouse - Aisle C3",
    "reason": "Rack consolidation"
  }'
```

Adjust quantity with `PATCH /api/v1/inventory/:id/quantity`, change lifecycle status with `PATCH /api/v1/inventory/:id/status`, and soft-remove with `DELETE /api/v1/inventory/:id`. Quantity, status, and removal calls require a reason. Removed items are retained for audit history.

## Scan Inventory

Operator scans use bearer authentication and device scans use `X-Device-Key`. Both paths call the same inventory scan workflow.

```sh
curl -X POST http://localhost:3000/api/v1/inventory/scan \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "SKU-100",
    "scanType": "barcode",
    "locationId": "AUSTIN-A1"
  }'
```

Batch scan up to 100 scan records:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/scan/batch \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scans": [
      { "value": "SKU-100", "scanType": "barcode", "locationId": "AUSTIN-A1" },
      { "value": "SNS-100-001", "scanType": "manual", "locationId": "AUSTIN-A1" }
    ]
  }'
```

Accepted scans update `lastScannedAt` and append `INVENTORY_SCANNED`. Wrong-location scans return `409`, append a rejected scan event, and expose an unexpected-location anomaly.

## Anomalies and Alerts

Read current findings without writing ledger events:

```sh
curl "http://localhost:3000/api/v1/inventory/anomalies?severity=critical" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/inventory/alerts?type=low_stock" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Generate ledger-backed findings:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/anomalies/detect \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X POST http://localhost:3000/api/v1/inventory/alerts/generate \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

External push/email alert delivery is not implemented yet. The web app currently uses in-app toaster notifications and inline status text.

## Error Handling

Inventory contracts define these domain error codes:

| Code | Typical HTTP status | Meaning |
| --- | --- | --- |
| `INVENTORY_INVALID_REQUEST` | `400` | Payload, filter, date range, pagination, or sort validation failed. |
| `INVENTORY_NOT_FOUND` | `404` | Inventory item, SKU, provenance target, or tenant-scoped resource is absent. |
| `INVENTORY_CONFLICT` | `409` | Duplicate SKU, over-reservation, no-op movement, removed item mutation, quantity conflict, or wrong-location scan. |
| `INVENTORY_FORBIDDEN` | `403` | Caller lacks the required inventory permission. |

| Status | Common cause | Client action |
| --- | --- | --- |
| `400` | Request schema failed validation. | Validate against `@true-north-ledger/inventory-contracts`. |
| `401` | Missing or expired bearer token, or invalid device key. | Re-authenticate or re-provision the device. |
| `403` | Actor lacks `inventory.read`, `inventory.write`, or `device.events.write`. | Update role or device permissions. |
| `404` | Item, SKU, or tenant-scoped resource was not found. | Confirm tenant, item ID, and SKU. |
| `409` | Duplicate SKU, over-reservation, no-op move, removed item mutation, or wrong-location scan. | Refresh item state and correct the operation. |

## Verification Commands

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/inventory/inventory.service.spec.ts
pnpm nx test ledger-api -- --runTestsByPath src/app/inventory/inventory.integration.spec.ts
pnpm nx test ledger-web -- --include apps/ledger-web/src/app/pages/inventory
pnpm nx e2e ledger-web-e2e -- apps/ledger-web-e2e/src/inventory.spec.ts
```
