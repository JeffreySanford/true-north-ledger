# True North Ledger

True North Ledger is an API-first audit and provenance platform for human workflows, business integrations, and secure device ingestion.

The product goal is simple: every actor has an identity, and every meaningful action becomes an auditable ledger event.

## Current Workspace

This repository is an Nx workspace using pnpm.

**Current Status:** Sprint 0 remediation, Sprint 1 authentication/RBAC, and Sprint 2 device management are complete and pushed. Sprint 3 order-management work has started with shared order contracts and schema tests.

Implemented now:

- `apps/ledger-web` - Angular web application with routing, SCSS, Vitest, and Playwright
- `apps/ledger-web-e2e` - Playwright e2e project with browser quality, login, permission, and full-stack JWT checks
- `apps/ledger-api` - NestJS REST API with PostgreSQL persistence, authenticated ledger events, auth endpoints, and Swagger/OpenAPI docs
- `libs/shared-models` - Unified contract library exports
- `libs/ledger-contracts` - Core Zod schemas for ledger events and metadata
- `libs/auth-contracts` - Actor type and permission schemas  
- `libs/device-contracts` - Device ledger event schemas
- `libs/order-contracts` - Order lifecycle, timeline, and proof schemas
- `libs/audit-contracts` - Audit metadata schemas
- Docker Compose infrastructure (PostgreSQL, Redis, PgAdmin)

**Test Status:**
- Backend test suites passing
- Frontend unit tests passing
- E2E Playwright suites passing across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari
- Lint/build/audit: passing cleanly

**Remaining Product Gaps:**
1. Sprint 3 orders backend, frontend, proof, and E2E workflows remain in active development.
2. Inventory, public proof pages, WebSockets, and production monitoring remain PI-1 roadmap work.
3. Browser auth can move from storage-backed bearer tokens toward secure cookie sessions when API/client constraints allow.

**Architecture:**
- Schema-driven contracts with Zod validation across frontend and API
- Observable-based reactive patterns (RxJS) for all async operations
- PostgreSQL persistence with TypeORM
- SHA-256 payload and event hash generation
- Previous-hash ledger chain linkage
- JWT, tenant, permission, and rate-limit guards on ledger endpoints
- Initial login/logout/refresh flow, guarded Angular routes, and permission-aware navigation
- Shared SCSS foundation in `apps/ledger-web/src/styles.scss` and `apps/ledger-web/src/styles/`
- Runtime secrets are loaded from ignored `.env.development` / `.env.production` files or deployment secret stores; `.env.example` is placeholder-only
- Swagger UI at `http://localhost:3000/api/docs`
- Docker Compose development environment

Planned platform parts:
- Docker Compose infrastructure for Postgres, Redis, API, web, observability, and reverse proxy.
- Device gateway and MQTT broker when real IoT volume requires them.

## Platform Shape

```mermaid
flowchart LR
  web[Web Dashboard]
  tablet[Tablet Operations]
  mobile[Mobile Scan and Approve]
  proof[Public QR Proof Pages]
  partner[Partner API Clients]
  device[Devices and Gateways]

  api[Ledger API]
  register[Device Registration and QR Provisioning]
  heartbeat[Device Heartbeats]
  events[Device Event Ingestion]
  ledger[Audit and Provenance Engine]
  db[(Postgres)]

  web --> api
  tablet --> api
  mobile --> api
  proof --> api
  partner --> api
  device --> api
  api --> register
  device --> heartbeat
  device --> events
  register --> ledger
  heartbeat --> ledger
  events --> ledger
  api --> ledger
  ledger --> db
```

## Core Principles

- Postgres is the system of record.
- NestJS writes and validates truth.
- Angular visualizes and operates on truth.
- Every write creates a ledger event.
- Users, services, devices, and system jobs all have auditable identities.
- WebSockets notify clients; they are not the source of truth.
- MQTT is a later ingestion option, not an MVP dependency.

## Getting Started

### Quick Start

Install dependencies:

```sh
pnpm install
```

Start all services (infrastructure + apps):

```sh
pnpm start:all
```

Or start services individually:

Start infrastructure:

```sh
pnpm docker:up
```

Start API server:

```sh
pnpm start:api
```

Start web application:

```sh
pnpm start:web
```

Stop infrastructure:

```sh
pnpm docker:down
```

Run tests:

```sh
pnpm nx test ledger-api
pnpm nx test ledger-web
pnpm nx e2e ledger-web-e2e
```

Open API documentation after `pnpm start:all`:

```sh
http://localhost:3000/api/docs
```

### Development Workflow

List all projects:

```sh
pnpm nx show projects
```

Build all:

```sh
pnpm nx run-many -t build
```

Test all:

```sh
pnpm nx run-many -t test
```

## Authentication Setup

### Required Auth Environment Variables

Runtime secrets are loaded from `.env.development` (local) and `.env.production` (deployment).

Set at minimum:

- `JWT_SECRET` strong signing secret for access and refresh JWTs
- `AUTH_USERNAME` seeded admin username for Sprint 1 bootstrap
- `AUTH_PASSWORD` seeded admin password for Sprint 1 bootstrap
- `AUTH_TENANT_ID` default tenant UUID for seeded auth workflows
- `JWT_EXPIRATION` access token TTL (example: `1h`)
- `JWT_REFRESH_EXPIRATION` refresh token TTL (example: `7d`)

Use `.env.example` as a template and provide real values through local ignored env files or deployment secret stores.

### Login Flow

1. Start API and web app.
2. Open `http://localhost:4200/login`.
3. Sign in with configured bootstrap credentials.
4. Confirm redirect to dashboard and permission-aware navigation.

Frontend implementation details are documented in [Frontend Login Flow Guide](documentation/development/frontend-login-flow.md).

### Service Token Setup

Use admin login first, then create service tokens via:

- `POST /api/v1/auth/service-token`
- `DELETE /api/v1/auth/service-token/:id`

See [Service Token Management](documentation/platform/service-token-management.md) for scope, rotation, and revocation guidance.
Partner onboarding examples are documented in [Service Token Integration Guide for Partners](documentation/platform/service-token-integration-guide.md).

## Device Management Setup

Device management uses the same API, web, PostgreSQL, Redis, and auth environment variables as the rest of local development. Start the stack with:

```sh
pnpm start:all
```

Register devices from `http://localhost:4200/devices` after signing in with a user that has `devices.read` and `devices.manage`. The registration response displays the raw device key and QR provisioning payload once; store the key immediately because only its hash is persisted.

Device-originated calls authenticate with:

```http
X-Device-Key: tnl_dev_example
```

Device event ingestion examples, curl commands, Python and Node snippets, payload examples, batch guidance, and troubleshooting are documented in [Device Event Ingestion Guide](documentation/platform/device-event-ingestion-guide.md).

Device-focused test commands:

```sh
pnpm nx test ledger-api -- --testPathPatterns=devices
pnpm nx test ledger-web -- --include apps/ledger-web/src/app/pages/devices/devices.component.spec.ts
pnpm nx e2e ledger-web-e2e -- apps/ledger-web-e2e/src/devices.spec.ts
```

## Order Management Setup

Sprint 3 order-management work starts with shared contracts. Backend and frontend order workflows are not active yet, but the order schemas are available through `@true-north-ledger/order-contracts` and `@true-north-ledger/shared-models`.

Order contract validation commands:

```sh
pnpm nx run order-contracts:lint
pnpm nx run order-contracts:build
pnpm nx run shared-models:test --coverage
```

Order lifecycle and proof contract details are documented in [Order Management](documentation/platform/order-management.md).

## Auth Testing Instructions

Run auth-related backend tests:

```sh
pnpm nx test ledger-api -- --runTestsByPath src/app/auth/auth.integration.spec.ts
pnpm nx test ledger-api -- --runTestsByPath src/app/ledger-events/ledger-events.integration.spec.ts
```

Run frontend auth unit tests:

```sh
pnpm nx test ledger-web
```

Run auth-focused e2e flows:

```sh
pnpm nx e2e ledger-web-e2e -- --grep "login|refresh|unauthorized|permission"
```

## Project Planning & Roadmap

**Current Phase:** PI-1 / Sprint 3 started

### Planning Documents

All planning documents are located in the [`planning/`](planning/) folder:

- **[PI-1 Planning](planning/PI-1-PLANNING.md)** - 10-week program increment plan (5 sprints)
  - Sprint 1: Authentication & Authorization (Weeks 1-2)
  - Sprint 2: Device Management & Identity (Weeks 3-4)  
  - Sprint 3: Orders Module & Ledger Integration (Weeks 5-6)
  - Sprint 4: Inventory Module & Provenance (Weeks 7-8)
  - Sprint 5: WebSocket Notifications & Production Infrastructure (Weeks 9-10)

- **[Sprint Task Documents](planning/)** - Detailed task breakdowns:
  - [Sprint 1 Tasks](planning/SPRINT-1-TASKS.md) - Authentication & Authorization
  - [Sprint 2 Tasks](planning/SPRINT-2-TASKS.md) - Device Management & Identity
  - [Sprint 3 Tasks](planning/SPRINT-3-TASKS.md) - Orders Module & Ledger Integration
  - [Sprint 4 Tasks](planning/SPRINT-4-TASKS.md) - Inventory Module & Provenance
  - [Sprint 5 Tasks](planning/SPRINT-5-TASKS.md) - WebSocket Notifications & Production

- **[Current State Assessment](planning/CURRENT-STATE.md)** - What's done vs. what's planned
- **[PI-1 Gamification & Visual Appeal](planning/PI-1-GAMIFICATION-VISUAL-APPEAL.md)** - MD3, shared UX primitives, animations, and gamification plan
- **[PI Planning Guide](planning/PI-PLANNING-GUIDE.md)** - How to use the planning documents

### What's Next (PI-1 Goals)

By end of PI-1 (10 weeks), the platform is planned to have:

- Secure authentication for all actor types (`user`, `service`, `device`, `system`)
- Device registration, authentication, and event ingestion
- Orders module with full audit trail
- Inventory tracking with device scan integration
- Real-time WebSocket notifications
- Production infrastructure with monitoring
- Public proof verification system
- Shared visual system with reusable MD3 components, accessible animations, and E2E coverage for visual states
- Expanded OpenAPI/Swagger documentation

## Documentation

### Architecture & Design

- [Documentation Index](documentation/README.md)
- [Product Brief](documentation/overview/product-brief.md)
- [Project Overview](documentation/overview/project-overview.md)
- [Architecture](documentation/architecture/architecture.md)
- [Applications](documentation/operations/applications.md)
- [API Design](documentation/platform/api-design.md)
- [Auditability Plan](documentation/platform/auditability-plan.md)
- [Ledger Model](documentation/platform/ledger-model.md)
- [Device Ingestion](documentation/platform/device-ingestion.md)
- [Device Management](documentation/platform/device-management.md)
- [Device Event Ingestion Guide](documentation/platform/device-event-ingestion-guide.md)
- [Order Management](documentation/platform/order-management.md)
- [Security Model](documentation/platform/security-model.md)
- [RBAC and Role-Specific Views](documentation/platform/rbac-and-views.md)
- [Service Token Management](documentation/platform/service-token-management.md)
- [Rate Limiting Configuration](documentation/platform/rate-limiting-configuration.md)
- [Auth Troubleshooting](documentation/platform/auth-troubleshooting.md)
- [Permission Configuration](documentation/platform/permission-configuration.md)
- [Data Model](documentation/architecture/data-model.md)
- [Infrastructure](documentation/operations/infrastructure.md)

### Development Guides

- [Development Workflow](documentation/development/development-workflow.md)
- [Getting Started with Authentication](documentation/development/getting-started-authentication.md)
- [Frontend Login Flow Guide](documentation/development/frontend-login-flow.md)
- [Testing and Quality Gates](documentation/development/testing-quality-gates.md)
- [Coding Standards](documentation/development/coding-standards.md)
- [Frontend UX System](documentation/development/frontend-ux-system.md)

### Integration Guides

- [Service Token Integration Guide for Partners](documentation/platform/service-token-integration-guide.md)
- [Device Event Ingestion Guide](documentation/platform/device-event-ingestion-guide.md)

### Planning & Roadmap

All planning documents are in the [`planning/`](planning/) folder:

- [PI-1 Planning](planning/PI-1-PLANNING.md) - Overall program increment plan
- [PI-1 Gamification & Visual Appeal](planning/PI-1-GAMIFICATION-VISUAL-APPEAL.md) - UX/gamification addendum
- [Sprint Task Documents](planning/) - Detailed sprint breakdowns (Sprints 1-5)
- [Current State Assessment](planning/CURRENT-STATE.md) - Progress tracking
- [PI Planning Guide](planning/PI-PLANNING-GUIDE.md) - How to use planning docs

## Known Issues

### RxJS TypeScript Deprecation Warnings

You may see TypeScript deprecation warnings from RxJS v7.8.2 in VS Code:

```
Option 'moduleResolution=node10' is deprecated...
Option 'baseUrl' is deprecated...
```

**These are benign warnings from the RxJS library's own `tsconfig.json` in `node_modules`.** They:
- ✅ Do not affect builds, tests, or runtime
- ✅ Are not errors in your code
- ✅ Cannot be fixed by modifying workspace configuration
- ✅ Will be resolved when RxJS releases an updated version

All builds and tests pass successfully despite these informational warnings.
