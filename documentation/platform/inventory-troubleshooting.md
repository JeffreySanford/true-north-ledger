# Inventory Troubleshooting

Use this guide when inventory API calls, device scans, or the Angular inventory page do not behave as expected.

## Quick Checks

1. Confirm the local stack is running with `pnpm start:all`.
2. Open Swagger at `http://localhost:3000/api/docs` and verify the inventory endpoints are listed.
3. Confirm the signed-in actor has `inventory.read` for reads and `inventory.write` for mutations.
4. For device-originated scans, confirm the device is active and has `device.events.write`.
5. Check the inventory item tenant, SKU, location, status, and reservation fields before retrying a mutation.

## API Errors

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401 Unauthorized` on inventory API | Missing or expired bearer token. | Sign in again or refresh the service token. |
| `401 Unauthorized` on device scan | Missing, invalid, revoked, or suspended `X-Device-Key`. | Re-provision or reactivate the device. |
| `403 Forbidden` | Actor lacks the required permission. | Grant `inventory.read`, `inventory.write`, or `device.events.write` as appropriate. |
| `404 Not Found` for an existing SKU | SKU belongs to a different tenant or was entered differently than expected. | Confirm tenant context and retry with the normalized SKU. |
| `409 Conflict` when adding | SKU already exists in the tenant. | Use the existing item or choose a new SKU. |
| `409 Conflict` when reserving | Quantity exceeds available stock, item is removed, or another reservation is active. | Refresh the item, release stale reservations, or reserve a smaller quantity. |
| `409 Conflict` when moving | Destination is the current location or item is removed. | Choose a different location or restore workflow context. |
| `409 Conflict` when scanning | Scan location differs from the item's current location. | Move the item first if the new location is legitimate, or investigate the unexpected-location anomaly. |

## Import Problems

Inventory import processes each row independently. A rejected row does not roll back other rows.

Common causes:

- Duplicate SKU in the same tenant.
- Missing required CSV headers: `sku`, `name`, `locationId`, `locationName`, `quantity`, `unitOfMeasure`.
- Non-integer or negative quantity.
- Invalid JSON when using pasted JSON input.
- More than 100 items in one request.

Recommended workflow:

1. Import a small sample first.
2. Review each row result in the UI.
3. Correct rejected rows and re-submit only those rows.
4. Refresh the inventory list and confirm imported SKUs are visible.

## Scan Problems

Inventory scans resolve the submitted `value` against SKU or serial number within the authenticated tenant.

Accepted scan behavior:

- Updates `lastScannedAt`.
- Appends `INVENTORY_SCANNED`.
- Shows accepted scan feedback in the web UI.

Rejected wrong-location behavior:

- Returns `409`.
- Still updates scan provenance with a rejected scan event.
- Appends `INVENTORY_ANOMALY_DETECTED`.
- Exposes an `unexpected_location` anomaly until inventory state is corrected.

If scans are missing from provenance, check whether the client is using `POST /api/v1/device-events` with `eventType: "inventory.scan"` or the direct `POST /api/v1/inventory/scan` endpoint. Both paths should eventually show inventory scan provenance, but the device event path also creates `DEVICE_EVENT_RECEIVED`.

## Device Event Issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Duplicate nonce error | The same device nonce was reused. | Keep one stable nonce per event retry; use a new nonce only for a distinct event. |
| Device event accepted but no inventory scan appears | Payload did not include a resolvable `value`, `sku`, `serialNumber`, or `barcode`. | Send one supported identity field. |
| Scan type rejected | `scanType` is outside `barcode`, `qr`, `rfid`, or `manual`. | Normalize device payload before sending. |
| Device events not visible in UI | Event was filtered by device identity, tenant, or route. | Check the device detail page and `/ledger-events`. |

See [Device Event Ingestion Guide](device-event-ingestion-guide.md) for scan payload examples.

## Reservation Timeout Issues

The API supports `timeoutMinutes` on reservation and `POST /api/v1/inventory/reservations/release-expired` to release expired reservations. There is no background scheduler yet.

For local testing or operations, trigger the release endpoint manually after the timeout has passed. Future job-runner work should call the same endpoint or service workflow.

## Alerts and Anomalies

`GET /api/v1/inventory/anomalies` and `GET /api/v1/inventory/alerts` compute current findings without writing ledger events.

`POST /api/v1/inventory/anomalies/detect` and `POST /api/v1/inventory/alerts/generate` write ledger-backed findings.

If alerts are visible in the page but no external message is sent, that is expected. External push/email notification transports remain planned for Sprint 5. Current UI feedback uses in-app toaster notifications plus inline status text.

## Local Verification

Run focused checks before investigating broader failures:

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/inventory/inventory.service.spec.ts
pnpm nx test ledger-api -- --runTestsByPath src/app/inventory/inventory.integration.spec.ts
pnpm nx test ledger-web -- --include apps/ledger-web/src/app/pages/inventory
pnpm nx e2e ledger-web-e2e -- apps/ledger-web-e2e/src/inventory.spec.ts
```

Run full gates when the focused checks pass:

```sh
pnpm nx run-many --target=lint --all --skip-nx-cache --parallel=3
pnpm nx run-many --target=test --all --skip-nx-cache --parallel=3
pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3
pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --workers=1
```
