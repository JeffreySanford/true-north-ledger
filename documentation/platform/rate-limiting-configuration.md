# Rate Limiting Configuration Guide

This guide documents Sprint 1 rate-limiting behavior, configuration, and validation for the ledger API.

## Goals

Rate limiting protects authentication and write-heavy endpoints from abuse while preserving normal user workflows.

Current implementation is enforced by `RateLimitGuard` and endpoint metadata overrides.

## Configuration Variables

Default rate-limit settings are loaded from environment variables:

- `LEDGER_RATE_LIMIT_MAX`: maximum write requests allowed per window
- `LEDGER_RATE_LIMIT_WINDOW_MS`: window size in milliseconds

Example values:

```env
LEDGER_RATE_LIMIT_MAX=100
LEDGER_RATE_LIMIT_WINDOW_MS=60000
```

## Scope and Keying Model

Rate limits are applied per tenant actor key:

- key format: `<tenantId>:<actorType>:<actorId>`
- reads (`GET`, `HEAD`, `OPTIONS`) are not rate limited
- writes are rate limited

This prevents one actor from starving all traffic for a tenant while still containing noisy callers.

## Endpoint Overrides

Some endpoints intentionally override default limits using route metadata.

Example:

- `POST /api/v1/ledger/events/append-override` uses endpoint-specific limits

Use endpoint overrides only when there is a clear workload reason and tests are present.

## Auth Endpoint Hardening

Auth endpoints should have stricter limits than general ledger writes.

Current Sprint 1 expectations:

- login attempts are constrained
- refresh/logout are also protected by rate limits

## Audit Events

When a request is blocked by rate limits, the API appends a ledger event:

- `RATE_LIMIT_EXCEEDED`

Event payload includes:

- request path
- HTTP method
- actor context and tenant scope from guard context

## Local Verification

Run targeted backend tests:

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/auth/rate-limit.guard.spec.ts src/app/auth/auth.integration.spec.ts
```

Run full backend tests:

```sh
pnpm nx test ledger-api
```

## Operational Recommendations

1. Start with conservative defaults and tune from observed traffic.
2. Keep login limits tighter than normal write endpoints.
3. Monitor `RATE_LIMIT_EXCEEDED` trends by tenant and actor type.
4. Revisit limits before high-volume PI milestones.

## Known Sprint 1 Constraints

- Current guard storage is in-memory for local and test workflows.
- Distributed, cross-instance coordination is planned for production hardening.
- If running multiple API instances, each instance currently tracks limits independently.
