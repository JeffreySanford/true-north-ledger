# Project Overview

True North Ledger is a responsive, API-first audit platform for humans, businesses, and devices.

It is not only an admin dashboard. The UI is one client among several: web, tablet, mobile, public proof pages, partner APIs, and device ingestion all write to or read from the same ledger-backed platform.

## Product Statement

True North Ledger captures meaningful business actions as verifiable ledger events so operational history can be reviewed, proven, and trusted.

## Main Actors

- `user` - human operator, admin, manager, or field worker.
- `service` - internal service, worker, script, or partner integration.
- `device` - scanner, printer, sensor, kiosk, tablet station, or edge gateway.
- `system` - platform-owned automated process.

Human users are authorized through RBAC roles such as `admin`, `operations_manager`, `inventory`, `shipping`, `billing`, `moderator`, `auditor`, `device_technician`, `support`, and `viewer`. Sprint 1 should seed a local admin user and replace local token setup with real login/session behavior.

## Main Workflows

```mermaid
flowchart TD
  actor[Actor]
  action[Business Action]
  api[API Request]
  auth[Auth and Permission Check]
  validation[Validation]
  event[Ledger Event]
  proof[Proof or Audit Trail]

  actor --> action --> api --> auth --> validation --> event --> proof
```

## Success Criteria

- Every write can be traced to an actor.
- Every important state change has a ledger event.
- Public proof pages can verify selected records without exposing private operational data.
- Devices are first-class identities, not anonymous API callers.
- UI experiences are shaped by workflow: web for command center, tablet for operations, mobile for scan and approve.
- Role-specific routes are planned from the beginning across web, tablet, and mobile surfaces.
