# API Troubleshooting

Use this guide when an integration receives unexpected API responses.

## 400 Bad Request

Likely causes:

- Request body does not match the documented schema.
- Required path, query, or body fields are missing.
- IDs are not valid UUIDs where UUIDs are required.

Checks:

1. Compare the request with `/api/docs-json`.
2. Confirm `Content-Type: application/json` is present for JSON bodies.
3. Validate payloads against the shared contract examples in the platform guides.

## 401 Unauthorized

Likely causes:

- Missing `Authorization: Bearer <accessToken>` header.
- Expired or malformed JWT.
- Missing, revoked, or suspended `X-Device-Key`.

Checks:

1. Log in again with `POST /api/v1/auth/login`.
2. Refresh the access token with `POST /api/v1/auth/refresh`.
3. Confirm device keys were copied from the one-time registration response.

## 403 Forbidden

Likely causes:

- Authenticated actor does not have the required permission.
- Tenant context does not match the requested resource.

Checks:

1. Review assigned roles and effective permissions.
2. Confirm the token belongs to the expected tenant.
3. Check ledger events for `PERMISSION_DENIED` or tenant isolation entries.

## 404 Not Found

Likely causes:

- Resource ID does not exist in the tenant.
- The endpoint path does not match the `/api/v1` versioned route.

Checks:

1. Recheck the path in `/api/docs`.
2. Query list endpoints before requesting a specific resource by ID.

## 409 Conflict

Likely causes:

- Invalid workflow transition.
- Duplicate device nonce.
- Inventory movement or scan conflict.

Checks:

1. Read the current resource state.
2. Retry with a new idempotency or nonce value only when the original action did not apply.
3. Use the ledger timeline to confirm the last accepted state transition.

## 429 Rate Limit Exceeded

Likely causes:

- Too many login, write, device event, scan, or override requests in the configured window.

Checks:

1. Back off and retry after the configured rate-limit window.
2. Review `RATE_LIMIT_EXCEEDED` ledger events.
3. Tune limits only after confirming the traffic pattern is expected.

## 5xx Server Errors

Likely causes:

- Database is unavailable.
- Required production environment variable is missing.
- Service dependency is unhealthy.

Checks:

1. Call `/api/health`.
2. Call `/api/ready`.
3. Review `/api/metrics`.
4. Check container health in the production Docker Compose stack.
