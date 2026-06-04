# Auth API Reference

This reference covers Sprint 1 authentication and authorization endpoints exposed from the ledger API.

Related operational guides:

- `documentation/platform/service-token-management.md`
- `documentation/platform/rate-limiting-configuration.md`
- `documentation/platform/permission-configuration.md`
- `documentation/platform/auth-troubleshooting.md`

## Base URLs

- API prefix: `/api`
- Auth root: `/api/v1/auth`
- Swagger UI: `/api/docs`
- OpenAPI JSON: `/api/docs-json`

## Security Schemes

- `jwt` bearer authentication is defined in the OpenAPI document.
- Protected endpoints require `Authorization: Bearer <access-token>`.

## Public Endpoints

### POST /api/v1/auth/login

Authenticate a user and issue access/refresh tokens.

Request body:

```json
{
  "username": "admin",
  "password": "admin"
}
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
    "permissions": ["ledger.read", "roles.manage", "users.manage"]
  }
}
```

Error responses:

- `400` invalid payload
- `401` invalid credentials
- `429` rate limit exceeded

### POST /api/v1/auth/refresh

Refresh access token using a valid refresh token.

Request body:

```json
{
  "refreshToken": "<jwt>"
}
```

Error responses:

- `400` invalid payload
- `401` invalid or revoked refresh token
- `429` rate limit exceeded

### POST /api/v1/auth/logout

Invalidate refresh token and end active session.

Request body:

```json
{
  "refreshToken": "<jwt>"
}
```

Error responses:

- `400` invalid payload
- `401` invalid refresh token
- `429` rate limit exceeded

## Admin-Protected Endpoints

### POST /api/v1/auth/service-token

Create a service token with scoped permissions.

Required permission:

- `admin`

### DELETE /api/v1/auth/service-token/:id

Revoke a service token by id.

Required permission:

- `admin`

Operational guidance for creation, scope, rotation, and revocation is documented in `documentation/platform/service-token-management.md`.

### POST /api/v1/auth/users/:userId/roles

Assign one or more roles to a user and recalculate effective permissions.

Required permission:

- `admin`

Request body:

```json
{
  "username": "ops.manager",
  "roles": ["operations_manager", "viewer"]
}
```

Success response includes resolved `roles` and `permissions`.

### POST /api/v1/auth/users/:userId/deactivate

Deactivate a tenant user and block future protected API access.

Required permission:

- `admin`

Request body:

```json
{
  "reason": "Security hold during incident review"
}
```

Success response includes `active: false` and the deactivation timestamp.

## Audit Events Emitted

The auth module writes the following ledger events:

- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `LOGOUT`
- `TOKEN_REFRESHED`
- `SERVICE_TOKEN_CREATED`
- `SERVICE_TOKEN_REVOKED`
- `PERMISSION_DENIED`
- `ROLE_ASSIGNMENT_UPDATED`
- `USER_DEACTIVATED`
- `RATE_LIMIT_EXCEEDED`
- `TENANT_ISOLATION_VIOLATION`
