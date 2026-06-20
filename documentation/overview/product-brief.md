# True North Ledger Product Brief

## What True North Ledger Is

True North Ledger is an API-first audit and provenance platform for business operations, device ingestion, and public proof verification.

It captures meaningful actions as authenticated, tenant-scoped ledger events and makes them available for review, verification, and trusted operational workflows.

## What Problem It Solves

Many organizations need a single source of truth for how work actually happens across people, systems, services, and devices.

Traditional operational systems scatter audit data, make it hard to verify change history, and often trust the client too much.

True North Ledger solves that by making every important action explicit, auditable, and chained together with verified hashes.

## Core Product Promise

- Every actor has an identity.
- Every important action becomes a ledger event.
- Every ledger event is tenant-scoped and permissions-protected.
- Every client is a first-class participant, not a second-class afterthought.

## Who Uses It

- `user` — human operators, managers, auditors, support staff.
- `service` — internal workers, partner integrations, automation.
- `device` — scanners, kiosks, sensors, edge gateways.
- `system` — scheduled jobs, background processes, platform automation.

## What It Is Not

- Not a cryptocurrency or blockchain network.
- Not a generic admin dashboard only.
- Not a client-side trust store.
- Not a system that lets clients write their own audit metadata.

True North Ledger is a platform where Postgres is the system of record, NestJS enforces trust, and ledger events provide verifiable operational history.

## Core Workflows

1. A client requests an action.
2. The API authenticates the actor.
3. The API checks tenant isolation and permissions.
4. The platform validates business data.
5. The platform writes a ledger event.
6. The ledger event is hashed and chained.
7. Clients may view or verify event history.

## Primary Product Surfaces

- Web dashboard for admin and operational workflows.
- Tablet/field workstations for scan and process flows.
- Mobile views for quick lookup, approvals, and alerts.
- Public proof pages for verifying selected records.
- Partner APIs for integrations and services.
- Device ingestion endpoints for scanners and gateways.

## Ledger and Trust Model

- Ledger events are append-only.
- The platform derives audit metadata, not the client.
- Each event includes a hash, previous hash, and chain sequence.
- Read access is granted through permissions; write access is gated by workflow and actor type.
- Tenant isolation ensures events and proofs stay scoped to the right organization.

## Security and Auth Model

- Authentication is JWT-based for human users.
- Service and device actors use scoped tokens or signatures.
- Human access is RBAC-based with roles and permissions.
- API guards enforce security before any UI route can show data.
- Sensitive operations are audited with event metadata.

## MVP Scope

The early product focuses on:

- Authenticated ledger write/read flows.
- Device and service actor support.
- Tenant isolation and permission enforcement.
- Audit chain integrity with hashes and sequence.
- Swagger/OpenAPI-backed API documentation.
- Playwright-backed browser quality tests.

## Current Status

The repository contains a credible early platform foundation with:

- Angular web frontend and Playwright E2E setup.
- NestJS Ledger API with authenticated endpoints.
- Initial auth endpoints, Angular login/logout UX, guarded routes, and permission-aware navigation.
- Device management with device identity, authenticated ingestion, heartbeat/status workflows, and audit visibility.
- Order management with lifecycle transitions, proof states, and ledger-backed timelines.
- Inventory management with reservations, movement, scans, provenance, anomalies, alerts, and dashboard views.
- Postgres-backed ledger persistence.
- Shared contract libraries and schema-driven validation.
- RBAC, tenant scoping, and rate limiting.
- Shared MD3/SCSS UX primitives for status chips, trust seals, mission cards, timelines, proof cards, connection state, empty/error states, and accessible animations.
- Sprint 4.5 cross-sprint hardening for permission states, responsive layouts, reduced-motion behavior, visual primitive selectors, audit metadata consistency, tenant isolation, and retry/idempotency paths.

Sprint 5 remains planned for WebSocket notifications, external notification transports, live operations UI, and production infrastructure hardening.

## Experience Direction

True North Ledger should feel like a secure command center, not a generic admin template. Visual polish and gamification must reinforce verified work:

- Badges and seals come from API, permission, or ledger state.
- Progress rails show real workflow completion, not arbitrary points.
- Material Icons and MD3 components should make state easier to scan.
- Angular animations should clarify transitions and live updates while honoring reduced-motion preferences.
- Shared styles and components keep the UI consistent as devices, orders, inventory, proofs, and live operations arrive during PI-1.

## Why This Matters

For businesses that need trustworthy operational history, True North Ledger provides a platform where actions are not only executed, but also recorded and verified in a way that supports audit, compliance, and collaboration across people, devices, and systems.
