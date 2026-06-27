# API Integration Guide

This guide shows the normal integration path for partner systems, service clients, and operator tooling that call the True North Ledger REST API.

## Base URLs

- Local API: `http://localhost:3000/api`
- Production API: the HTTPS origin published in the OpenAPI server list
- Swagger UI: `/api/docs`
- OpenAPI JSON: `/api/docs-json`
- Current public API version: `/api/v1`

## Authentication Flow

1. Call `POST /api/v1/auth/login` with bootstrap or tenant credentials.
2. Store the returned `accessToken` and `refreshToken` in the client secret/session store.
3. Send protected requests with `Authorization: Bearer <accessToken>`.
4. Call `POST /api/v1/auth/refresh` before access-token expiry.
5. Call `POST /api/v1/auth/logout` to revoke the refresh token when the session ends.

Device integrations use `X-Device-Key` for device heartbeat, device event ingestion, and inventory scan workflows that explicitly allow device authentication. Device keys are returned once during registration and must be stored in device secret storage.

## Authentication Documentation

The OpenAPI document defines two security schemes:

- `jwt`: standard bearer authentication for users, operators, admins, and service tokens.
- `device-key`: `X-Device-Key` header authentication for registered devices.

The Auth API Reference documents login, refresh, logout, service token, role assignment, and user deactivation endpoints. Device authentication is limited to device-originated workflows and should not be reused for operator or partner service calls.

## Bearer Token Example

```sh
ACCESS_TOKEN="<jwt-from-login>"

curl -sS "http://localhost:3000/api/v1/ledger/events" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Example Requests And Responses

### Login

```sh
curl -sS -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Success response:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": {
    "userId": "admin",
    "username": "admin",
    "actorType": "user",
    "tenantId": "00000000-0000-0000-0000-000000000000",
    "roles": ["admin"],
    "permissions": ["ledger.read", "ledger.write"]
  }
}
```

### Create An Order

```sh
curl -sS -X POST "http://localhost:3000/api/v1/orders" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"customer-100","items":[{"sku":"SKU-100","quantity":1}]}'
```

Success response:

```json
{
  "id": "00000000-0000-4000-8000-000000000101",
  "orderNumber": "ORD-100",
  "customerId": "customer-100",
  "status": "pending"
}
```

### Device Event

Endpoint: `POST /api/v1/device-events`

```sh
curl -sS -X POST "http://localhost:3000/api/v1/device-events" \
  -H "X-Device-Key: $DEVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"SCAN_RECEIVED","payload":{"sku":"SKU-100","quantity":1},"nonce":"scan-001"}'
```

Success response:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000201",
  "serverTimestamp": "2026-06-26T12:00:00.000Z",
  "nonce": "scan-001"
}
```

## Error Response Examples

Validation failure:

```json
{
  "statusCode": 400,
  "message": "Invalid request payload",
  "error": "Bad Request"
}
```

Authentication failure:

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

Permission failure:

```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

Rate-limit failure:

```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded"
}
```

## Code Examples

### curl

```sh
curl -sS "http://localhost:3000/api/v1/inventory" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Python

```python
import requests

response = requests.get(
    "http://localhost:3000/api/v1/inventory",
    headers={"Authorization": f"Bearer {access_token}"},
    timeout=10,
)
response.raise_for_status()
items = response.json()
```

### Node.js

```js
const response = await fetch('http://localhost:3000/api/v1/inventory', {
  headers: { Authorization: `Bearer ${accessToken}` },
});

if (!response.ok) {
  throw new Error(`API request failed: ${response.status}`);
}

const items = await response.json();
```

## Rate Limiting

Write-heavy endpoints and auth endpoints are rate limited. When a request exceeds its configured limit, the API returns `429` and appends a `RATE_LIMIT_EXCEEDED` ledger event when actor context is available.

Operational defaults and tuning guidance are documented in [Rate Limiting Configuration](rate-limiting-configuration.md).

## Related References

- [API Changelog](api-changelog.md)
- [Auth API Reference](auth-api-reference.md)
- [Device Event Ingestion Guide](device-event-ingestion-guide.md)
- [Service Token Integration Guide](service-token-integration-guide.md)
- [API Troubleshooting](api-troubleshooting.md)
