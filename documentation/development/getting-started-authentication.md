# Getting Started with Authentication

This guide helps frontend and backend contributors run and validate the Sprint 1 authentication stack end to end.

## Prerequisites

- Node.js and pnpm installed
- Docker running locally
- Repository dependencies installed with `pnpm install`

## 1. Start Infrastructure and Apps

1. Start local dependencies:
   - `pnpm docker:up`
2. Start API:
   - `pnpm start:api`
3. Start web app:
   - `pnpm start:web`

Default local endpoints:
- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:4200`

## 2. Configure Environment Variables

Use `.env.development` for local execution. Required auth-related keys include:

- `JWT_SECRET`
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_TENANT_ID`
- `JWT_EXPIRATION`
- `JWT_REFRESH_EXPIRATION`
- `REDIS_URL`
- `LEDGER_GLOBAL_RATE_LIMIT_MAX`
- `LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS`
- `LEDGER_RATE_LIMIT_MAX`
- `LEDGER_RATE_LIMIT_WINDOW_MS`

If `JWT_SECRET` is missing, API startup fails by design.

## 3. Verify Core Auth Flows

Use either Swagger or API tests to verify:

1. Login
   - `POST /api/v1/auth/login`
   - Expect access and refresh tokens
2. Refresh
   - `POST /api/v1/auth/refresh`
   - Expect rotated token pair
3. Logout
   - `POST /api/v1/auth/logout`
   - Expect refresh token revocation
4. Service token create/revoke
   - `POST /api/v1/auth/service-token`
   - `DELETE /api/v1/auth/service-token/:id`

## 4. Verify Rate Limiting

- Global throttling is configured through Nest throttler with Redis-backed storage.
- Public auth endpoints enforce stricter per-route limits via `RateLimitGuard` metadata.
- Validate throttling behavior with:
  - `pnpm nx test ledger-api -- --testPathPatterns=rate-limit.guard.spec.ts`
  - `pnpm nx test ledger-api -- --testPathPatterns=auth.integration.spec.ts --testNamePattern "rate limit"`

## 5. Run Auth Test Suites

Backend unit/integration:
- `pnpm nx test ledger-api -- --runTestsByPath src/app/auth/auth.service.spec.ts src/app/auth/auth.integration.spec.ts`

Frontend auth unit:
- `pnpm nx test ledger-web -- --runTestsByPath src/app/auth.service.spec.ts src/app/pages/login/login.component.spec.ts`

E2E auth flows:
- `pnpm nx e2e ledger-web-e2e --grep "login|logout|refresh|audit event"`

## 6. Troubleshooting

- JWT/signature errors: confirm `JWT_SECRET` consistency across runtime and tests.
- Redis unavailable: throttler and token blacklist services fall back to in-process behavior for local continuity.
- 429 responses during local e2e: run browser-project-specific subsets if needed to reduce concurrent auth calls.

Related references:
- `documentation/platform/security-model.md`
- `documentation/platform/rate-limiting-configuration.md`
- `documentation/platform/service-token-management.md`
- `documentation/development/frontend-login-flow.md`
- `documentation/platform/service-token-integration-guide.md`
