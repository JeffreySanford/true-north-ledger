# Data Model

Postgres is the primary database. Current-state tables support product workflows; `ledger_events` remains the canonical audit trail.

## Core Tables

```mermaid
erDiagram
  TENANTS ||--o{ USERS : owns
  TENANTS ||--o{ DEVICES : owns
  TENANTS ||--o{ LEDGER_EVENTS : records
  DEVICES ||--o{ DEVICE_EVENTS : emits
  DEVICE_EVENTS ||--o| LEDGER_EVENTS : creates

  TENANTS {
    uuid id
    text name
  }

  USERS {
    uuid id
    uuid tenant_id
    text email
    text status
  }

  DEVICES {
    uuid id
    uuid tenant_id
    text name
    text device_type
    text status
    timestamptz last_seen_at
  }

  DEVICE_EVENTS {
    uuid id
    uuid tenant_id
    uuid device_id
    text event_type
    jsonb payload
    text nonce
    boolean accepted
  }

  LEDGER_EVENTS {
    uuid id
    uuid tenant_id
    text actor_type
    uuid actor_id
    text event_type
    text event_hash
    text previous_hash
  }
```

## Device Tables

`devices`:

- `id uuid primary key`
- `tenant_id uuid not null`
- `name text not null`
- `device_type text not null`
- `status text not null`
- `public_key text`
- `certificate_fingerprint text`
- `last_seen_at timestamptz`
- `created_at timestamptz not null`
- `revoked_at timestamptz`

`device_events`:

- `id uuid primary key`
- `tenant_id uuid not null`
- `device_id uuid not null`
- `event_type text not null`
- `payload jsonb not null`
- `nonce text not null`
- `signature text`
- `accepted boolean not null`
- `rejection_reason text`
- `created_at timestamptz not null`
- `ledger_event_id uuid`
