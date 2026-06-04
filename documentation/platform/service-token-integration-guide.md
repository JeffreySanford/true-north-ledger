# Service Token Integration Guide for Partners

This guide is for integration partners who call True North Ledger APIs without an interactive user login.

## When to Use Service Tokens

Use service tokens when your integration:

- runs as a backend service, scheduled job, or middleware process
- needs tenant-scoped API access
- should operate with least-privilege permissions

Do not use service tokens for browser user sessions.

## Integration Lifecycle

```mermaid
flowchart LR
  Admin[Admin User] --> Create[Create Service Token]
  Create --> Vault[Store Token in Secret Manager]
  Vault --> Client[Partner Integration Client]
  Client --> API[Ledger API Calls]
  API --> Audit[Ledger Audit Events]
  Create --> Rotate[Rotate Token]
  Rotate --> Vault
  Vault --> Revoke[Revoke Old Token]
```

## Prerequisites

- Admin user credentials for token creation and revocation
- Tenant ID and required API scopes/permissions
- Secret manager for token storage (not source control)

## Step 1: Create a Service Token

Endpoint:

- `POST /api/v1/auth/service-token`

Headers:

- `Authorization: Bearer <admin-access-token>`

Body example:

```json
{
  "name": "partner-sync-readonly",
  "permissions": ["ledger.read", "proof.read"]
}
```

Response includes a one-time raw token value:

```json
{
  "id": "2f2d2d11-8b8c-4bdf-aec8-8f9d6db76123",
  "name": "partner-sync-readonly",
  "tenantId": "00000000-0000-0000-0000-000000000000",
  "permissions": ["ledger.read", "proof.read"],
  "token": "tnl_st_xxx_one_time_value",
  "createdAt": "2026-06-04T12:30:00.000Z",
  "revoked": false
}
```

Important:

- Copy the raw token at creation time. It is not recoverable later.
- Server stores only hashed token values.

## Step 2: Store Token Securely

- Save token in a managed secret store.
- Inject at runtime through environment variables.
- Never commit token to git or logs.
- Restrict who can read the secret.

Example environment variable:

- `TNL_SERVICE_TOKEN`

## Step 3: Call APIs with Bearer Auth

Request example:

```http
GET /api/v1/ledger/events HTTP/1.1
Host: localhost:3000
Authorization: Bearer tnl_st_xxx_one_time_value
```

If permission is missing, API returns `403` and emits `PERMISSION_DENIED` audit event.

## Step 4: Rotation Strategy

Rotate on a regular cadence and immediately after potential compromise.

Recommended runbook:

1. Create new token with same or narrower scope.
2. Deploy new token to integration runtime.
3. Validate integration health.
4. Revoke old token.

## Step 5: Revoke Token

Endpoint:

- `DELETE /api/v1/auth/service-token/:id`

Headers:

- `Authorization: Bearer <admin-access-token>`

Effects:

- token can no longer authenticate
- `SERVICE_TOKEN_REVOKED` event is appended

## Error Handling

| Status | Meaning | Partner action |
| --- | --- | --- |
| `401` | Missing/invalid token | Validate token value and secret injection |
| `403` | Insufficient permission | Update token scope or endpoint usage |
| `429` | Rate limit exceeded | Apply retries with backoff |
| `5xx` | Server-side issue | Retry with jitter and alert operators |

Retry guidance:

- Use exponential backoff with jitter for `429` and transient `5xx` responses.
- Do not retry indefinitely; cap attempts and alert on persistent failure.

## Audit and Compliance Expectations

Service-token operations are auditable through ledger events:

- `SERVICE_TOKEN_CREATED`
- `SERVICE_TOKEN_REVOKED`
- `PERMISSION_DENIED` (for unauthorized calls)

Partners should record:

- integration name
- token owner team
- token purpose
- rotation date
- revocation history

## Minimal cURL Examples

Create token:

```sh
curl -X POST http://localhost:3000/api/v1/auth/service-token \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"partner-sync-readonly","permissions":["ledger.read","proof.read"]}'
```

Use token:

```sh
curl http://localhost:3000/api/v1/ledger/events \
  -H "Authorization: Bearer $TNL_SERVICE_TOKEN"
```

Revoke token:

```sh
curl -X DELETE "http://localhost:3000/api/v1/auth/service-token/$TOKEN_ID" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
```

## Related Documents

- `documentation/platform/service-token-management.md`
- `documentation/platform/auth-api-reference.md`
- `documentation/platform/security-model.md`
- `documentation/platform/auth-troubleshooting.md`