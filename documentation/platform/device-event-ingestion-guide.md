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
      "station": "dock-a"
    },
    "nonce": "scanner-01-000001"
  }'
```

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
- Store device keys in device secret storage, never in logs or plain configuration files.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401 Unauthorized` | Missing, invalid, revoked, or suspended device key. | Re-provision the device or reactivate it from the registry. |
| `403 Forbidden` | Device lacks `device.events.write`. | Register or update the device with event-write permission. |
| `409 Conflict` | Nonce was already used inside the replay window. | Retry with the original response if known, otherwise send a new event with a new nonce only if it is a distinct event. |
| `400 Bad Request` | Payload schema or payload size failed validation. | Trim payloads and verify `eventType`, `payload`, and optional `timestamp`/`nonce`. |
| Events not visible in UI | Event was rejected or filtered by device identity. | Check `/ledger-events`, the device detail stream, and server logs for the correlation id. |
