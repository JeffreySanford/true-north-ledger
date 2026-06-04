# Architecture

True North Ledger uses an Nx monorepo so applications, shared contracts, and infrastructure can evolve together.

This document describes the architecture and platform shape. For the product narrative, end-user goals, and business-facing context, see [Product Brief](../overview/product-brief.md).

## Current Repo State

```mermaid
flowchart TD
  repo[true-north-ledger]
  apps[apps]
  web[ledger-web]
  e2e[ledger-web-e2e]
  nx[Nx workspace config]

  repo --> apps
  repo --> nx
  apps --> web
  apps --> e2e
  apps --> api[ledger-api]
```

## Target Platform

```mermaid
flowchart LR
  subgraph Clients
    web[Web Dashboard]
    tablet[Tablet Workbench]
    mobile[Mobile Actions]
    proof[Public Proof Pages]
    partner[Partner API]
    device[Devices]
  end

  subgraph Backend
    api[NestJS Ledger API]
    auth[Auth and Permissions]
    writer[Ledger Event Writer]
    notify[WebSocket Notifications]
  end

  subgraph Data
    pg[(Postgres)]
    redis[(Redis)]
  end

  Clients --> api
  api --> auth
  auth --> writer
  writer --> pg
  writer --> notify
  api --> redis
```

## Request Flow

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant Guard as Auth Guard
  participant Service
  participant Ledger as Ledger Writer
  participant DB as Postgres
  participant WS as WebSocket

  Client->>API: Write request
  API->>Guard: Verify actor and permission
  Guard-->>API: Allowed
  API->>Service: Execute use case
  Service->>Ledger: Record ledger event
  Ledger->>DB: Transaction and hash update
  Ledger->>WS: Emit notification
  API-->>Client: Result
```

## Design Rules

- REST is the first write path.
- WebSockets provide live updates after durable writes.
- MQTT is deferred until device volume or protocol requirements justify it.
- Ledger events are append-only.
- Feature libraries should expose contracts and behavior, not duplicate domain types.
- Shared runtime schema contracts should validate the same request, response, and persisted event shapes across frontend, API, and storage.
- API permissions are enforced before UI route gating; web, tablet, and mobile views should derive visibility from the same role/permission model.
- Frontend styling should flow through the shared UX system in [Frontend UX System](../development/frontend-ux-system.md): `styles.scss`, `styles/` partials, MD3 overrides, reusable components, and reduced-motion-aware animations.
- Gamified UI elements must derive from API, permission, or ledger state; the browser never becomes the source of truth.
