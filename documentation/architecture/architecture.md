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
    inventory[Inventory Service]
    devices[Device Event Service]
    writer[Ledger Event Writer]
    notify[WebSocket Notifications]
  end

  subgraph Data
    pg[(Postgres)]
    redis[(Redis)]
  end

  Clients --> api
  api --> auth
  api --> inventory
  api --> devices
  auth --> writer
  inventory --> writer
  devices --> inventory
  devices --> writer
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

## Inventory and Device Scan Flow

Inventory operations are tenant-scoped write workflows. Operator and service clients use bearer authentication for inventory APIs. Registered devices use `X-Device-Key` for heartbeats, domain events, and direct inventory scans.

```mermaid
sequenceDiagram
  participant Scanner as Device Scanner
  participant API as Ledger API
  participant DeviceSvc as Device Event Service
  participant InvSvc as Inventory Service
  participant Ledger as Ledger Writer
  participant DB as Postgres
  participant UI as Web Inventory UI

  Scanner->>API: POST /api/v1/device-events<br/>eventType inventory.scan
  API->>DeviceSvc: Validate X-Device-Key, permissions, nonce
  DeviceSvc->>Ledger: Record DEVICE_EVENT_RECEIVED
  DeviceSvc->>InvSvc: Track scan from payload
  InvSvc->>DB: Resolve SKU or serial within tenant
  alt Location matches current item location
    InvSvc->>DB: Update lastScannedAt
    InvSvc->>Ledger: Record INVENTORY_SCANNED accepted
  else Location differs
    InvSvc->>Ledger: Record INVENTORY_SCANNED rejected
    InvSvc->>Ledger: Record INVENTORY_ANOMALY_DETECTED
  end
  API-->>Scanner: Accepted event or scan conflict
  UI->>API: GET /api/v1/inventory/:id?includeProvenance=true
  API-->>UI: Item, timeline, reservation history, scan history
```

```mermaid
flowchart LR
  bearer[Operator or Service Token] --> invapi[Inventory API]
  devicekey[Registered Device Key] --> directscan[Direct Inventory Scan API]
  devicekey --> deviceevents[Device Event API]
  deviceevents --> scantracking[Inventory Scan Tracking]
  directscan --> scantracking
  invapi --> inventory[(Inventory Items)]
  scantracking --> inventory
  inventory --> provenance[Inventory Provenance]
  scantracking --> anomalies[Anomalies and Alerts]
  provenance --> ledger[(Append-only Ledger Events)]
  anomalies --> ledger
```

## Design Rules

- REST is the first write path.
- WebSockets provide live updates after durable writes.
- MQTT is deferred until device volume or protocol requirements justify it.
- Ledger events are append-only.
- Inventory state changes, scans, anomalies, and alerts must be represented as ledger events when they mutate or persist workflow state.
- Device-originated inventory scans must preserve both device event provenance and inventory scan provenance when routed through `POST /api/v1/device-events`.
- Feature libraries should expose contracts and behavior, not duplicate domain types.
- Shared runtime schema contracts should validate the same request, response, and persisted event shapes across frontend, API, and storage.
- API permissions are enforced before UI route gating; web, tablet, and mobile views should derive visibility from the same role/permission model.
- Frontend styling should flow through the shared UX system in [Frontend UX System](../development/frontend-ux-system.md): `styles.scss`, `styles/` partials, MD3 overrides, reusable components, and reduced-motion-aware animations.
- Gamified UI elements must derive from API, permission, or ledger state; the browser never becomes the source of truth.
