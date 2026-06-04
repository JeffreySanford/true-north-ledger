# RBAC and Role-Specific Views

This document describes the platform's RBAC and view-access model for human, service, device, and system actors. The architecture already includes guard rails for JWT, tenant scoping, permission checks, and protected ledger endpoints. The goal is to turn those controls into a product-grade auth system that supports user roles, session lifecycle, role administration, and route/view gating.

## Design Principles

- A user can have one or more roles within a tenant.
- Roles are bundles of permissions, not hard-coded business logic.
- Permissions protect API actions first; UI route gating is a usability layer, not the security boundary.
- Every denied sensitive action should be auditable where safe.
- Web, tablet, and mobile views should share permissions but expose different workflows.
- During early development, the initial seeded user is treated as an `admin` persona until full user/role administration replaces the seeded account workflow.

## Actor Types and Roles

Actor types identify what is calling the platform. Roles identify what a human user can do.

| Actor type | Examples | Auth method |
| --- | --- | --- |
| `user` | Admin, inventory clerk, shipping operator, billing user, moderator, auditor | Login/session JWT |
| `service` | Partner integration, batch job, internal worker | Scoped service token |
| `device` | Scanner, kiosk, printer, sensor, gateway | Device token or signed request |
| `system` | Scheduled cleanup, internal automation | Internal platform credential |

## Initial Human Roles

| Role | Purpose | Default surfaces |
| --- | --- | --- |
| `admin` | Tenant owner and platform administrator | Web admin console, tablet supervision, mobile emergency actions |
| `operations_manager` | Oversees daily warehouse/order/inventory work | Web dashboard, tablet work queues, mobile approvals |
| `inventory` | Manages stock, provenance, adjustments, receiving | Web inventory, tablet receiving/counting, mobile scan lookup |
| `shipping` | Packs, labels, dispatches, confirms shipments | Tablet shipping station, mobile dispatch confirmation, limited web order views |
| `billing` | Reviews billable activity, invoices, payment exceptions | Web billing and order financial views |
| `moderator` | Reviews anomalies, disputes, suspicious events, proof issues | Web moderation queue, mobile urgent review |
| `auditor` | Read-only audit, ledger, proof, and export review | Web audit/proof views |
| `device_technician` | Registers, pairs, rotates, and revokes devices | Web device registry, tablet pairing flow, mobile device diagnostics |
| `support` | Helps users with non-sensitive operational problems | Web support console with limited tenant/user visibility |
| `viewer` | Read-only operational visibility | Web dashboards and proof-safe records |

## Permission Catalog

Use granular permissions in contracts and guards. Roles should map to these permissions.

| Permission | Allows |
| --- | --- |
| `ledger.read` | Read tenant ledger events |
| `ledger.write` | Append general ledger events through approved workflows |
| `ledger.audit` | Verify hash chain and export audit records |
| `proof.read` | Read proof-safe records |
| `proof.manage` | Create, revoke, or publish proof records |
| `users.read` | View tenant users and assignments |
| `users.manage` | Invite users, deactivate users, assign roles |
| `roles.manage` | Create/edit role-to-permission mappings |
| `orders.read` | View orders |
| `orders.write` | Create/update orders |
| `orders.status.write` | Change order status |
| `inventory.read` | View inventory and provenance |
| `inventory.write` | Add, reserve, move, adjust, or remove inventory |
| `inventory.scan.write` | Submit scan-backed inventory updates |
| `shipping.read` | View shipping queues and shipment history |
| `shipping.write` | Pack, label, dispatch, and confirm shipments |
| `billing.read` | View billable orders, charges, and billing reports |
| `billing.write` | Create adjustments and billing actions |
| `moderation.read` | View anomalies, disputes, and review queues |
| `moderation.write` | Resolve anomalies, flag records, moderate proofs |
| `devices.read` | View device registry and device status |
| `devices.manage` | Register, pair, rotate credentials, revoke devices |
| `device.events.write` | Submit device-originated events |
| `admin.override.write` | Perform explicit override actions with reason capture |
| `settings.read` | View tenant settings |
| `settings.write` | Change tenant settings |

## Role to Permission Matrix

| Permission | Admin | Ops Manager | Inventory | Shipping | Billing | Moderator | Auditor | Device Tech | Support | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ledger.read` | X | X | X | X | X | X | X | X | X | X |
| `ledger.write` | X | X | X | X |  | X |  | X |  |  |
| `ledger.audit` | X | X |  |  | X | X | X |  |  |  |
| `proof.read` | X | X | X | X | X | X | X |  | X | X |
| `proof.manage` | X | X |  |  |  | X |  |  |  |  |
| `users.read` | X | X |  |  |  |  |  |  | X |  |
| `users.manage` | X |  |  |  |  |  |  |  |  |  |
| `roles.manage` | X |  |  |  |  |  |  |  |  |  |
| `orders.read` | X | X | X | X | X | X | X |  | X | X |
| `orders.write` | X | X |  |  |  |  |  |  |  |  |
| `orders.status.write` | X | X |  | X |  |  |  |  |  |  |
| `inventory.read` | X | X | X | X | X | X | X |  | X | X |
| `inventory.write` | X | X | X |  |  |  |  |  |  |  |
| `inventory.scan.write` | X | X | X | X |  |  |  |  |  |  |
| `shipping.read` | X | X |  | X | X | X | X |  | X | X |
| `shipping.write` | X | X |  | X |  |  |  |  |  |  |
| `billing.read` | X | X |  |  | X |  | X |  |  |  |
| `billing.write` | X |  |  |  | X |  |  |  |  |  |
| `moderation.read` | X | X |  |  |  | X | X |  | X |  |
| `moderation.write` | X |  |  |  |  | X |  |  |  |  |
| `devices.read` | X | X |  |  |  | X | X | X | X |  |
| `devices.manage` | X |  |  |  |  |  |  | X |  |  |
| `device.events.write` | X |  |  |  |  |  |  | X |  |  |
| `admin.override.write` | X | X |  |  |  |  |  |  |  |  |
| `settings.read` | X | X |  |  |  |  | X |  | X |  |
| `settings.write` | X |  |  |  |  |  |  |  |  |  |

## Route and View Access

Implementation source of truth in Sprint 1:

- Backend role-to-permission mappings are defined in `apps/ledger-api/src/app/auth/role-permissions.ts`.
- Frontend route permission/surface metadata is defined in `apps/ledger-web/src/app/app.routes.ts`.

### Route Metadata Standard

All protected frontend routes must include:

- `requiredPermissions: string[]` for permission enforcement
- `surface: 'web' | 'tablet' | 'mobile' | 'public'` for device-surface gating
- optional `featureTitle` for planned placeholder routes

Route metadata is enforced by `authGuard` and validated in unit tests.

### Sprint 1 Route Registry

The following table tracks role-specific route groups and current implementation state.

| Route | Surface | Required permission | Sprint 1 state |
| --- | --- | --- | --- |
| `/dashboard` | `web` | `ledger.read` | Implemented |
| `/ledger-events` | `web` | `ledger.read` | Implemented |
| `/orders` | `web` | `orders.read` | Planned route scaffold |
| `/inventory` | `web` | `inventory.read` | Planned route scaffold |
| `/shipping` | `web` | `shipping.read` | Planned route scaffold |
| `/billing` | `web` | `billing.read` | Planned route scaffold |
| `/moderation` | `web` | `moderation.read` | Planned route scaffold |
| `/devices` | `web` | `devices.read` | Implemented |
| `/proofs` | `web` | `proof.read` | Implemented |
| `/users` | `web` | `users.read` | Planned route scaffold |
| `/roles` | `web` | `roles.manage` | Planned route scaffold |
| `/settings` | `web` | `settings.read` | Implemented |
| `/tablet/receiving` | `tablet` | `devices.read` | Implemented |
| `/tablet/counts` | `tablet` | `inventory.read` | Planned route scaffold |
| `/tablet/pick-pack` | `tablet` | `shipping.read` | Planned route scaffold |
| `/tablet/labeling` | `tablet` | `shipping.read` | Planned route scaffold |
| `/tablet/device-pairing` | `tablet` | `devices.manage` | Planned route scaffold |
| `/tablet/supervisor` | `tablet` | `admin.override.write` | Planned route scaffold |
| `/mobile/scan` | `mobile` | `proof.read` | Implemented |
| `/mobile/inventory` | `mobile` | `inventory.read` | Planned route scaffold |
| `/mobile/orders` | `mobile` | `orders.read` | Planned route scaffold |
| `/mobile/approve` | `mobile` | `admin.override.write` | Planned route scaffold |
| `/mobile/device` | `mobile` | `devices.manage` | Planned route scaffold |
| `/mobile/proofs` | `mobile` | `proof.read` | Planned route scaffold |
| `/mobile/alerts` | `mobile` | `moderation.read` | Planned route scaffold |

### Web Views

The route registry table above is the authorization source of truth. The role groupings below are workflow-oriented examples and should be interpreted through required-permission checks.

| Route group | Primary roles | Purpose |
| --- | --- | --- |
| `/dashboard` | Admin, operations manager, viewer | Tenant summary, operational status, alerts |
| `/ledger-events` | Admin, operations manager, auditor, moderator | Ledger event stream and chain verification |
| `/orders` | Admin, operations manager, shipping, billing, auditor, support | Order list, order detail, status history |
| `/inventory` | Admin, operations manager, inventory, auditor, support | Stock, reservations, adjustments, provenance |
| `/shipping` | Admin, operations manager, shipping | Shipping queues, packing, labels, dispatch |
| `/billing` | Admin, billing, auditor | Billing dashboard, adjustments, billing reports |
| `/moderation` | Admin, moderator, operations manager | Anomalies, disputes, suspicious actions |
| `/devices` | Admin, device technician, auditor, support | Registry, pairing, revocation, heartbeat status |
| `/proofs` | Admin, moderator, auditor, viewer | Proof lookup, publication, revocation |
| `/users` | Admin, support read-only | User list, invitations, deactivation |
| `/roles` | Admin | Role and permission assignment |
| `/settings` | Admin, operations manager read-only | Tenant settings and integration setup |

### Tablet Views

Tablet routes should be touch-first, dense enough for repeated work, and constrained to operational tasks.

| Route group | Primary roles | Purpose |
| --- | --- | --- |
| `/tablet/receiving` | Inventory, operations manager | Receive goods, scan items, create inventory events |
| `/tablet/counts` | Inventory, operations manager | Cycle counts, discrepancies, adjustments |
| `/tablet/pick-pack` | Shipping, operations manager | Pick lists, packing confirmation, exception capture |
| `/tablet/labeling` | Shipping, device technician | Label print/verify flow |
| `/tablet/device-pairing` | Device technician, admin | Pair scanners, kiosks, printers, and station devices |
| `/tablet/supervisor` | Admin, operations manager | Override queue, floor status, urgent approvals |

### Mobile Views

Mobile routes should focus on fast scan, approve, inspect, and alert workflows.

| Route group | Primary roles | Purpose |
| --- | --- | --- |
| `/mobile/scan` | Admin, operations manager, inventory, shipping, billing, moderator, auditor, support, viewer | Fast scan workflow and jump-off actions |
| `/mobile/inventory` | Admin, operations manager, inventory, shipping, billing, moderator, auditor, support, viewer | Inventory lookup and provenance summary |
| `/mobile/orders` | Admin, operations manager, inventory, shipping, billing, moderator, auditor, support, viewer | Order lookup and allowed quick actions |
| `/mobile/approve` | Admin, operations manager | Approvals, overrides, anomaly decisions |
| `/mobile/device` | Admin, device technician | Device status, pairing, credential rotation |
| `/mobile/proofs` | Admin, operations manager, inventory, shipping, billing, moderator, auditor, support, viewer | Proof-safe mobile verification |
| `/mobile/alerts` | Admin, operations manager, moderator, auditor, support | Urgent exceptions and review queue |

## Sprint 1 Implementation Order

1. Define auth contracts for users, roles, permissions, JWT claims, login, logout, refresh, and current user response.
2. Add backend `auth`, `users`, and `roles` modules with seeded default roles.
3. Continue frontend login/session state without committing static tokens.
4. Add API permission guards using the granular permission names above.
5. Add frontend route metadata for required permissions and device surfaces: `web`, `tablet`, `mobile`, `public`.
6. Add role-aware navigation so users only see allowed routes.
7. Add audit events for login success/failure, logout, permission denied, role assignment, and user deactivation.
8. Add E2E tests for admin login, denied access, role-specific navigation, and mobile/tablet route gating.

## Open Decisions

- Browser token storage decision is complete for Sprint 1: default session storage with explicit Remember Me opt-in for persistent local storage; secure cookie transition remains a follow-up when API/client constraints allow.
- Whether users can hold multiple roles or one role plus explicit permission overrides; default should allow multiple roles.
- Whether `moderator` can revoke proofs directly or only recommend revocation.
- Whether `support` is tenant-local only or cross-tenant with strict break-glass auditing.
