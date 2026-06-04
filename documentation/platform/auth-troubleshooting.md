# Authentication Troubleshooting Guide

This guide covers common Sprint 1 auth failures and how to diagnose them quickly.

## Quick Triage Checklist

1. Confirm API is running and reachable at `/api`.
2. Confirm required auth env vars are set.
3. Verify login credentials match configured values.
4. Check browser storage for session token state.
5. Check API responses for `401`, `403`, or `429` patterns.
6. Check ledger audit events for auth/permission/rate-limit actions.

## Environment and Startup Issues

### Symptom: API fails to boot with missing auth config

Typical message:

- `Missing required environment variable: JWT_SECRET`

Actions:

1. Set `JWT_SECRET` in local env file.
2. Ensure `AUTH_USERNAME`, `AUTH_PASSWORD`, and `AUTH_TENANT_ID` are present.
3. Restart API.

## Login Failures

### Symptom: `POST /api/v1/auth/login` returns 401

Possible causes:

- incorrect username/password
- wrong local env values
- stale frontend form autofill values

Actions:

1. Verify `AUTH_USERNAME` and `AUTH_PASSWORD` values.
2. Retry with explicit credentials from local env.
3. Check ledger events for `LOGIN_FAILED`.

## Token and Session Failures

### Symptom: protected API returns 401 after login

Possible causes:

- expired access token
- malformed token in storage
- invalid JWT signature due to wrong secret

Actions:

1. Confirm `Authorization` header contains bearer token.
2. Trigger refresh flow and verify new token state.
3. If refresh fails, log in again.
4. Validate API and token minting use the same `JWT_SECRET`.

### Symptom: user is redirected to login unexpectedly

Possible causes:

- refresh token is missing or revoked
- refresh endpoint returns 401
- background refresh failed and session was cleared

Actions:

1. Check `/api/v1/auth/refresh` response.
2. Confirm refresh token exists in active storage.
3. Re-authenticate and reproduce.

## Permission and Tenant Failures

### Symptom: protected API returns 403

Possible causes:

- missing required permission
- role assignment does not include required grants
- tenant mismatch request context

Actions:

1. Inspect required permission for endpoint.
2. Confirm resolved permissions for the actor.
3. Check ledger for `PERMISSION_DENIED` and `TENANT_ISOLATION_VIOLATION` events.

### Symptom: tenant isolation violation errors

Possible causes:

- request includes `X-Tenant-Id` that differs from token tenant
- client attempted cross-tenant read/write

Actions:

1. Remove mismatched tenant header.
2. Ensure token `tenantId` matches request context.
3. Review violation events and actor identity.

## Rate Limit Failures

### Symptom: API returns 429

Possible causes:

- login or write request burst exceeded limit window

Actions:

1. Pause until window resets.
2. Re-run request sequence at lower rate.
3. Check ledger for `RATE_LIMIT_EXCEEDED` events.
4. Review local rate-limit env values.

## Useful Test Commands

Backend targeted auth suites:

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/auth/auth.integration.spec.ts src/app/auth/tenant.guard.spec.ts
```

Frontend auth unit suites:

```sh
pnpm nx test ledger-web
```

Auth-focused e2e scenarios:

```sh
pnpm nx e2e ledger-web-e2e -- --grep "login|refresh|permission|tenant isolation"
```

## Escalation Data to Capture

When opening a bug, include:

- failing endpoint and status code
- request correlation id if available
- actor type and tenant id
- relevant ledger auth events
- exact env variables used (without secret values)
