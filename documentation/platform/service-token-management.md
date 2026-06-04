# Service Token Creation and Management

This guide defines how service tokens are created, used, rotated, and revoked in Sprint 1.

## Purpose

Service tokens authenticate non-human actors such as partner integrations and internal jobs.

Use service tokens when:

- no interactive user login exists
- access needs a narrow permission scope
- actions must remain tenant-scoped and auditable

## Security Model

- Raw service tokens are returned once at creation.
- The API stores only a hashed token value.
- Revoked tokens are denied immediately.
- Service-token requests are tenant-scoped.
- Service-token actions emit ledger audit events.

## Endpoints

All endpoints below require an admin JWT.

### Create Service Token

`POST /api/v1/auth/service-token`

Request body:

```json
{
  "name": "partner-sync",
  "permissions": ["ledger.read"]
}
```

Response includes:

- token `id`
- token `name`
- `tenantId`
- granted `permissions`
- one-time raw `token`
- `createdAt`
- `revoked`

### Revoke Service Token

`DELETE /api/v1/auth/service-token/:id`

Revocation marks token as unusable for future authentication attempts.

## Runtime Use

Use service tokens as bearer tokens:

```http
Authorization: Bearer <service-token>
```

Example read call:

```http
GET /api/v1/ledger/events
Authorization: Bearer <service-token>
```

## Audit Events

The API emits:

- `SERVICE_TOKEN_CREATED`
- `SERVICE_TOKEN_REVOKED`
- `PERMISSION_DENIED` when token lacks required permission

## Operational Guidance

### Naming

Use descriptive names tied to one integration purpose, for example:

- `partner-sync-readonly`
- `wms-export-job`
- `billing-reconciliation`

### Scope

Assign only required permissions.

Avoid broad scopes like `admin` for service tokens.

### Rotation

Recommended process:

1. Create a replacement token with identical or reduced scope.
2. Deploy new token to the integration.
3. Validate integration health.
4. Revoke the old token.

### Revocation Response

When compromise is suspected:

1. Revoke the token immediately.
2. Review recent ledger events for token `subjectId`.
3. Issue replacement token with reduced scope if possible.

## Current Sprint 1 Implementation Notes

- Service-token records are persisted with tenant-scoped metadata and hashed token values.
- Raw tokens remain one-time visibility values and are not recoverable after creation.
- Rotation cadence, ownership, and incident-response procedures should be formalized before production rollout.

For partner onboarding and integration examples, see `documentation/platform/service-token-integration-guide.md`.
