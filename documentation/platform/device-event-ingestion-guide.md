# Device Event Ingestion Guide

This guide covers the Sprint 2 device ingestion path for registered devices using `X-Device-Key`.

## Quick Start

1. Register a device from the web registry or `POST /api/v1/devices/register`.
2. Store the one-time `apiKey` immediately. The API stores only a hash.
3. Send heartbeats to `POST /api/v1/devices/heartbeat`.
4. Send event records to `POST /api/v1/device-events`.
5. Verify accepted events in the device detail audit stream or `/ledger-events`.

## Authentication

Every device-originated request uses the raw key returned once at registration:

```http
X-Device-Key: tnl_dev_example
```

Revoked and suspended devices are rejected before event ingestion.

## Single Event

Inventory scanner events should use `eventType: "inventory.scan"` when the device event should also drive inventory scan tracking. The payload must include one inventory identity field:

- `value`
- `sku`
- `serialNumber`
- `barcode`

The inventory scan type is read from `payload.scanType` when present. If omitted, the server defaults to `barcode` when `barcode` is present and `manual` otherwise. Supported scan types are `barcode`, `qr`, `rfid`, and `manual`.

```sh
curl -X POST http://localhost:3000/api/v1/device-events \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: tnl_dev_example" \
  -d '{
    "eventType": "inventory.scan",
    "timestamp": "2026-06-04T12:10:00.000Z",
    "payload": {
      "sku": "SKU-001",
      "quantity": 4,
      "barcode": "012345678905",
      "scanType": "barcode",
      "locationId": "dock-a",
      "station": "dock-a"
    },
    "nonce": "scanner-01-000001"
  }'
```

Accepted inventory scan events create both `DEVICE_EVENT_RECEIVED` and `INVENTORY_SCANNED` ledger events. Wrong-location scans are recorded as rejected inventory scans and create an `INVENTORY_ANOMALY_DETECTED` event.

## Batch Events

Use `POST /api/v1/device-events/batch` when a device is catching up after intermittent connectivity or forwarding multiple downstream records.

```sh
curl -X POST http://localhost:3000/api/v1/device-events/batch \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: tnl_dev_example" \
  -d '{
    "events": [
      {
        "eventType": "inventory.scan",
        "timestamp": "2026-06-04T12:10:00.000Z",
        "payload": { "sku": "SKU-001", "quantity": 4 },
        "nonce": "scanner-01-000001"
      },
      {
        "eventType": "inventory.scan.confirmed",
        "timestamp": "2026-06-04T12:10:01.000Z",
        "payload": { "sku": "SKU-001", "accepted": true },
        "nonce": "scanner-01-000002"
      }
    ]
  }'
```

Batch requests return per-item results. Duplicate nonces or invalid payloads are reported per event.

## Inventory Scan Protocol

Devices have two supported scan paths:

| Path | Use when | Auth |
| --- | --- | --- |
| `POST /api/v1/device-events` | The device is sending a domain event that should be visible in the device audit stream and may also update inventory scan state. | `X-Device-Key` with `device.events.write` |
| `POST /api/v1/inventory/scan` | The scanner is acting as a direct inventory scanner and does not need a separate device event envelope. | `X-Device-Key` with `device.events.write`, or bearer token with `inventory.write` |

Direct device scan example:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/scan \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: tnl_dev_example" \
  -d '{
    "value": "SKU-001",
    "scanType": "barcode",
    "locationId": "dock-a"
  }'
```

Direct batch scan example:

```sh
curl -X POST http://localhost:3000/api/v1/inventory/scan/batch \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: tnl_dev_example" \
  -d '{
    "scans": [
      { "value": "SKU-001", "scanType": "barcode", "locationId": "dock-a" },
      { "value": "SERIAL-001", "scanType": "manual", "locationId": "dock-a" }
    ]
  }'
```

Inventory scan resolution is tenant-scoped. The server matches the submitted value against SKU or serial number. A scan with a `locationId` that differs from the item's current location returns `409`, but still records rejected scan provenance so operators can investigate the unexpected-location anomaly.

Prefer `POST /api/v1/device-events` when the hardware event includes additional device-domain metadata that should be audited. Prefer direct inventory scan endpoints for simple scanner workflows where the inventory item state is the primary concern.

## SDK Examples

Python:

```python
import requests

response = requests.post(
    "http://localhost:3000/api/v1/device-events",
    headers={"X-Device-Key": "tnl_dev_example"},
    json={
        "eventType": "inventory.scan",
        "payload": {"sku": "SKU-001", "quantity": 4},
        "nonce": "scanner-01-000001",
    },
    timeout=10,
)
response.raise_for_status()
print(response.json())
```

Node.js:

```js
const response = await fetch('http://localhost:3000/api/v1/device-events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-Key': 'tnl_dev_example',
  },
  body: JSON.stringify({
    eventType: 'inventory.scan',
    payload: { sku: 'SKU-001', quantity: 4 },
    nonce: 'scanner-01-000001',
  }),
});

if (!response.ok) {
  throw new Error(`Device event failed: ${response.status}`);
}

console.log(await response.json());
```

## Hardware Payload Examples

The source of truth for hardware examples is `DeviceHardwareExamples` in `@true-north-ledger/shared-models`.

| Device | Event type | Payload shape |
| --- | --- | --- |
| Scanner | `inventory.scan` | `sku`, `quantity`, `barcode`, `station` |
| Printer | `label.printed` | `labelId`, `orderId`, `carrier`, `station` |
| Sensor | `environment.temperature` | `temperature`, `humidity`, `thresholdExceeded` |
| Kiosk | `kiosk.return.accepted` | `returnId`, `orderId`, `accepted` |
| Gateway | `gateway.batch.summary` | `forwarded`, `failed`, `windowSeconds` |
| Tablet | `workflow.approval` | `workflowId`, `approved`, `reason` |

## Best Practices

- Use one nonce per event and keep nonce values stable across retries.
- Prefer batch ingestion only for catch-up or gateway forwarding. Do not batch routine low-latency events just to reduce request count.
- Keep payloads domain-specific and compact. Single-event payloads are limited to 16 KiB; batch payloads are limited to 64 KiB total.
- Include device-local timestamps when available. The server still records its own accepted timestamp.
- Include `locationId` for inventory scans when the device knows the station or zone. This enables wrong-location anomaly detection.
- Use `sku` or `serialNumber` when available. Use `barcode` when the scanner only has the raw encoded value.
- Store device keys in device secret storage, never in logs or plain configuration files.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401 Unauthorized` | Missing, invalid, revoked, or suspended device key. | Re-provision the device or reactivate it from the registry. |
| `403 Forbidden` | Device lacks `device.events.write`. | Register or update the device with event-write permission. |
| `409 Conflict` | Nonce was already used inside the replay window. | Retry with the original response if known, otherwise send a new event with a new nonce only if it is a distinct event. |
| `400 Bad Request` | Payload schema or payload size failed validation. | Trim payloads and verify `eventType`, `payload`, and optional `timestamp`/`nonce`. |
| Events not visible in UI | Event was rejected or filtered by device identity. | Check `/ledger-events`, the device detail stream, and server logs for the correlation id. |
