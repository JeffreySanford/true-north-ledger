# Sprint 4.5: Cross-Sprint Hardening & UI Cleanup

**Sprint Duration:** 1 week bridge sprint after Sprint 4 completion  
**Sprint Goal:** Tighten Sprint 1-4 quality with targeted edge-state tests, visual regression coverage, and low-risk UI cleanup before starting Sprint 5 real-time operations.
**Status:** Proposed from Sprint 1-4 review on 2026-06-18.

---

## Review Summary

Sprint 1 through Sprint 4 are mostly complete from a product-flow perspective. The remaining value is not more happy-path coverage; those paths already have strong unit, integration, and Playwright coverage. The useful follow-up work is concentrated in:

- Cross-sprint edge cases and denied-state coverage.
- Visual primitive and responsive regression coverage.
- UI density cleanup in workflow-heavy pages, especially inventory.
- Documentation gaps that support development-environment handoff and future Sprint 5 work.

---

## Acceptance Criteria

- [ ] Sprint 1-4 smoke e2e matrix covers one representative authenticated journey across auth, devices, orders, and inventory.
- [ ] Critical empty/loading/error/permission states have unit or component tests where they are currently only indirectly covered.
- [ ] Shared visual primitives have focused tests for state variants, reduced-motion behavior, and responsive non-overlap.
- [ ] Inventory page operational forms are visually grouped and easier to scan without changing API behavior.
- [ ] Sprint 4 remaining documentation gaps are closed or explicitly deferred to Sprint 5.
- [ ] No new feature scope is introduced beyond hardening, documentation, and UI cleanup.

---

## Testing Follow-Ups

### Unit and Component Tests

- [ ] Add route-permission matrix tests for role-aware navigation across Sprint 1-4 feature routes.
- [ ] Add focused tests for empty, loading, failed, and permission-denied states in feature shell components.
- [ ] Add visual primitive component tests for:
  - [ ] `tnl-status-chip` state labels and non-color status text.
  - [ ] `tnl-severity-chip` warning/error/critical variants.
  - [ ] `tnl-trust-seal` pending/verified/failed states.
  - [ ] `tnl-empty-state` layout and accessible text.
  - [ ] `tnl-connection-status` connecting/failed/recovered states.
- [ ] Add inventory dashboard component tests for zero-data, high-risk health, and mixed alert/anomaly states.
- [ ] Add orders page tests for proof unavailable, proof failed, and invalid transition messaging.
- [ ] Add devices page tests for revoked/suspended visual states and QR provisioning empty/error states.
- [ ] Add API negative-path tests where gaps remain:
  - [ ] Inventory external notification delivery failures once push/email channels exist.
  - [ ] Inventory background reservation release scheduling once a job runner exists.
  - [ ] Location registry validation remains deferred until a registry exists.

### Integration Tests

- [ ] Add cross-module audit consistency tests that verify actor, tenant, correlation ID, and subject metadata across auth, device, order, and inventory ledger events.
- [ ] Add tenant-isolation regression tests for list/detail endpoints where only mutation endpoints are currently emphasized.
- [ ] Add idempotency/retry tests around order creation and inventory batch operations.

### E2E Tests

- [ ] Add one Sprint 1-4 smoke journey:
  - [ ] Login.
  - [ ] Register or view a device.
  - [ ] Create or inspect an order.
  - [ ] Add, scan, move, and view inventory provenance.
  - [ ] Verify ledger-backed status/provenance is visible.
- [ ] Add permission e2e checks for hidden navigation and unauthorized fallback across devices, orders, inventory, and admin-only actions.
- [ ] Add reduced-motion e2e checks for scan feedback, timeline/progress visuals, and event-highlight styles.
- [ ] Add responsive no-overlap/no-horizontal-overflow checks for:
  - [ ] Login/auth shell.
  - [ ] Devices dashboard.
  - [ ] Orders list/detail.
  - [ ] Inventory dashboard and operations area.
- [ ] Add failed-network e2e coverage for one representative page per feature module.

---

## UI Cleanup Follow-Ups

### Inventory Page

- [ ] Split the inventory operations area into scan, bulk operations, and add-item bands so forms are easier to scan.
- [ ] Convert repeated scan and bulk move result rows into a compact shared result-list style with success/rejected icons and consistent spacing.
- [ ] Move per-row quantity/status/move/remove controls behind a compact details/action panel to reduce table density.
- [ ] Keep table columns focused on SKU, name, location, quantity, status, and primary actions.
- [ ] Add clearer loading and disabled button states for long-running bulk actions.
- [ ] Verify mobile layout after cleanup across Chromium, WebKit, Mobile Chrome, and Mobile Safari.

### Orders Page

- [ ] Review order lifecycle rail spacing and status labels for mobile wrapping.
- [ ] Add clearer proof unavailable/failed visual states.
- [ ] Keep proof hash and audit metadata readable without widening the viewport.

### Devices Page

- [ ] Review QR provisioning card layout for narrow mobile widths.
- [ ] Normalize revoked, suspended, inactive, and active device state visuals with shared status chips.
- [ ] Improve empty fleet and failed heartbeat states using the shared empty/error primitives.

### Shared Visual System

- [ ] Document canonical spacing, density, and state-token usage for feature dashboards.
- [ ] Avoid nested panel/card layouts in new cleanup work.
- [ ] Prefer compact icon-plus-label controls for repeated table actions.
- [ ] Add visual e2e selectors for shared primitives only where they represent user-visible workflow state.

---

## Documentation Follow-Ups

- [ ] Create inventory integration guide.
- [ ] Document device scan protocol.
- [ ] Add inventory troubleshooting guide.
- [ ] Add inventory setup instructions to README or development docs.
- [ ] Update architecture diagram for completed auth, device, order, and inventory flows.
- [ ] Document current deferred items:
  - [ ] Real-time inventory push updates move to Sprint 5.
  - [ ] External inventory alert push/email delivery moves to Sprint 5.
  - [ ] Location registry validation remains dependent on a future location registry.
  - [ ] Reservation timeout background scheduling remains a future job-runner workflow.

---

## Definition of Done

- [ ] Focused unit/component tests pass.
- [ ] Focused integration tests pass.
- [ ] Focused Playwright suites pass across configured browser/device projects.
- [ ] `pnpm nx run-many --target=lint --all --skip-nx-cache --parallel=3` passes.
- [ ] `pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3` passes.
- [ ] `git diff --check` passes.
- [ ] Sprint 1-4 task files remain accurate, with any deferred work linked to Sprint 4.5 or Sprint 5.
