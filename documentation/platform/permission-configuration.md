# Permission Configuration Guide

This guide explains how permissions are defined, assigned, and enforced in Sprint 1.

## Source of Truth

Permission grants are resolved from:

1. direct actor permissions in token/session context
2. role-to-permission catalog mappings
3. user role assignments

Roles are mapped to permissions in backend auth role catalog code and validated through guard enforcement.

## Permission Naming Convention

Use dot-case, action-oriented names.

Examples:

- `ledger.read`
- `ledger.write`
- `ledger.audit`
- `orders.status.write`
- `devices.manage`
- `proof.read`

Guidelines:

- `<domain>.<action>` for simple grants
- `<domain>.<subdomain>.<action>` for granular operations
- prefer explicit names over overloaded broad scopes

## Core Permission Domains

Current domains include:

- ledger
- orders
- inventory
- shipping
- billing
- moderation
- devices
- proof
- users
- roles
- settings
- admin overrides

Reference role matrix:

- [RBAC and Role-Specific Views](rbac-and-views.md)

## Role Assignment Flow

1. Admin calls role assignment endpoint.
2. Backend validates role names.
3. Assigned roles are persisted in auth service role records.
4. Effective permissions are recomputed from role mappings plus direct grants.
5. `ROLE_ASSIGNMENT_UPDATED` audit event is appended.

## API Guard Enforcement

Protected endpoints declare required permissions.

Guard behavior:

1. Extract actor context from request.
2. Resolve effective permissions.
3. Compare against endpoint required permissions.
4. Allow request when all required permissions are present.
5. Deny with `403` and append `PERMISSION_DENIED` event otherwise.

## Frontend Route Gating

Frontend route metadata uses:

- `requiredPermissions`
- `surface` (`web`, `tablet`, `mobile`, `public`)

Route visibility is UX gating only. API guard checks remain the security boundary.

## Adding a New Permission

1. Define permission name using dot-case.
2. Add permission to the role mapping catalog where appropriate.
3. Apply permission to API endpoints with guard metadata.
4. Add or update unit/integration tests for allow/deny behavior.
5. Add or update e2e tests for route visibility and unauthorized fallback.
6. Update RBAC documentation matrix.

## Testing Commands

Backend permission tests:

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/auth/permissions.guard.spec.ts src/app/auth/auth.integration.spec.ts
```

Frontend route/guard tests:

```sh
pnpm nx test ledger-web
pnpm nx e2e ledger-web-e2e -- --grep "permission|unauthorized"
```

## Common Misconfigurations

- permission string typo between route metadata and guard expectation
- role exists but missing permission mapping
- direct token permissions used in tests but role mapping not updated
- frontend route gated correctly while backend endpoint permission metadata is missing

## Auditability Expectations

Permission-related audit events should include enough context to diagnose failures safely:

- action type (`PERMISSION_DENIED`)
- actor identity
- required permissions
- actual resolved permissions
- endpoint path and tenant context
