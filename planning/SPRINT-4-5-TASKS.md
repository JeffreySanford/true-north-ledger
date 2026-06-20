# Sprint 4.5: Cross-Sprint Hardening & UI Cleanup

**Sprint Duration:** 1 week bridge sprint after Sprint 4 completion  
**Sprint Goal:** Tighten Sprint 1-4 quality with targeted edge-state tests, visual regression coverage, and low-risk UI cleanup before starting Sprint 5 real-time operations.
**Status:** Complete as of 2026-06-20.

---

## Review Summary

Sprint 1 through Sprint 4 are mostly complete from a product-flow perspective. The remaining value is not more happy-path coverage; those paths already have strong unit, integration, and Playwright coverage. The useful follow-up work is concentrated in:

- Cross-sprint edge cases and denied-state coverage.
- Visual primitive and responsive regression coverage.
- UI density cleanup in workflow-heavy pages, especially inventory.
- Documentation gaps that support development-environment handoff and future Sprint 5 work.

---

## Acceptance Criteria

- [x] Sprint 1-4 smoke e2e matrix covers one representative authenticated journey across auth, devices, orders, and inventory.
- [x] Critical empty/loading/error/permission states have unit or component tests where they are currently only indirectly covered.
- [x] Shared visual primitives have focused tests for state variants, reduced-motion behavior, and responsive non-overlap.
- [x] Inventory page operational forms are visually grouped and easier to scan without changing API behavior.
- [x] Sprint 4 remaining documentation gaps are closed or explicitly deferred to Sprint 5.
- [x] No new feature scope is introduced beyond hardening, documentation, and UI cleanup.

---

## Testing Follow-Ups

### Unit and Component Tests

- [x] Add route-permission matrix tests for role-aware navigation across Sprint 1-4 feature routes.
- [x] Add focused tests for empty, loading, failed, and permission-denied states in feature shell components.
- [x] Add visual primitive component tests for:
  - [x] `tnl-status-chip` state labels and non-color status text.
  - [x] `tnl-severity-chip` warning/error/critical variants.
  - [x] `tnl-trust-seal` pending/verified/failed states.
  - [x] `tnl-empty-state` layout and accessible text.
  - [x] `tnl-connection-status` connected/connecting/disconnected/failed states.
- [x] Add inventory dashboard component tests for zero-data, high-risk health, and mixed alert/anomaly states.
- [x] Add orders page tests for proof unavailable, proof failed, and invalid transition messaging.
- [x] Add devices page tests for revoked/suspended visual states and QR provisioning empty/error states.
- [x] API negative-path gaps that require missing platform infrastructure are explicitly deferred to Sprint 5 or later:
  - [x] Inventory external notification delivery failures once push/email channels exist.
  - [x] Inventory background reservation release scheduling once a job runner exists.
  - [x] Location registry validation remains deferred until a registry exists.

### Integration Tests

- [x] Add cross-module audit consistency tests that verify actor, tenant, correlation ID, and subject metadata across auth, device, order, and inventory ledger events.
- [x] Add tenant-isolation regression tests for list/detail endpoints where only mutation endpoints are currently emphasized.
- [x] Add idempotency/retry tests around order creation and inventory batch operations.

### E2E Tests

- [x] Add one Sprint 1-4 smoke journey:
  - [x] Login.
  - [x] Register or view a device.
  - [x] Create or inspect an order.
  - [x] Add, scan, move, and view inventory route state.
  - [x] Verify authenticated cross-feature route access is visible.
- [x] Add permission e2e checks for hidden navigation and unauthorized fallback across devices, orders, inventory, and admin-only actions.
- [x] Add reduced-motion e2e checks for scan feedback, timeline/progress visuals, and event-highlight styles.
- [x] Add responsive no-overlap/no-horizontal-overflow checks for:
  - [x] Login/auth shell.
  - [x] Devices dashboard.
  - [x] Orders list/detail.
  - [x] Inventory dashboard and operations area.
- [x] Add failed-network e2e coverage for one representative page per feature module.

---

## UI Cleanup Follow-Ups

### Inventory Page

- [x] Split the inventory operations area into scan, bulk operations, and add-item bands so forms are easier to scan.
- [x] Convert repeated scan and bulk move result rows into a compact shared result-list style with success/rejected icons and consistent spacing.
- [x] Move per-row quantity/status/move/remove controls behind a compact details/action panel to reduce table density.
- [x] Keep table columns focused on SKU, name, location, quantity, status, and primary actions.
- [x] Add clearer loading and disabled button states for long-running bulk actions.
- [x] Verify mobile layout after cleanup across Chromium, WebKit, Mobile Chrome, and Mobile Safari.

### Orders Page

- [x] Review order lifecycle rail spacing and status labels for mobile wrapping.
- [x] Add clearer proof unavailable/failed visual states.
- [x] Keep proof hash and audit metadata readable without widening the viewport.

### Devices Page

- [x] Review QR provisioning card layout for narrow mobile widths.
- [x] Normalize revoked, suspended, inactive, and active device state visuals with shared status chips.
- [x] Improve empty fleet and failed heartbeat states using the shared empty/error primitives.

### Shared Visual System

- [x] Document canonical spacing, density, and state-token usage for feature dashboards.
- [x] Avoid nested panel/card layouts in new cleanup work.
- [x] Leverage shared MD3 Expressive styles for repeated inventory and order page panels, forms, timelines, tables, and action states.
- [x] Prefer compact icon-plus-label controls for repeated table actions.
- [x] Add visual e2e selectors for shared primitives only where they represent user-visible workflow state.

---

## Documentation Follow-Ups

- [x] Create inventory integration guide.
- [x] Document device scan protocol.
- [x] Add inventory troubleshooting guide.
- [x] Add inventory setup instructions to README or development docs.
- [x] Update architecture diagram for completed auth, device, order, and inventory flows.
- [x] Document current deferred items:
  - [x] Real-time inventory push updates move to Sprint 5.
  - [x] External inventory alert push/email delivery moves to Sprint 5.
  - [x] Location registry validation remains dependent on a future location registry.
  - [x] Reservation timeout background scheduling remains a future job-runner workflow.

---

## Definition of Done

- [x] Focused unit/component tests pass.
- [x] Focused integration tests pass through full API regression suite.
- [x] Focused Playwright suites pass across configured browser/device projects.
- [x] `pnpm nx run-many --target=lint --all --skip-nx-cache --parallel=3` passes.
- [x] `pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3` passes.
- [x] `git diff --check` passes.
- [x] Sprint 1-4 task files remain accurate, with any deferred work linked to Sprint 4.5 or Sprint 5.

### Progress Verification

- [x] `pnpm lint:all` - all 10 lint targets passed.
- [x] Focused shared visual primitive component specs passed: 5 files / 21 tests.
- [x] Focused inventory visual primitive Playwright check passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] Focused inventory dashboard component spec passed: 1 file / 6 tests.
- [x] Focused inventory dashboard Playwright check passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] Hardened accepted scan e2e feedback check to wait for the scan POST response before asserting toaster and inline feedback state.
- [x] Focused accepted scan Playwright check passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] Focused auth guard route-permission matrix spec passed: 1 file / 8 tests.
- [x] Focused login route-permission Playwright matrix passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 10 tests.
- [x] Focused Sprint 1-4 smoke journey passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] Full login Playwright spec passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 180 tests.
- [x] Focused devices component spec passed with revoked/suspended state labels and disabled revoked controls: 1 file / 12 tests.
- [x] Focused device registration component spec passed with QR pending/error states: 1 file / 8 tests.
- [x] Focused devices fleet-board Playwright check passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] Focused order detail component spec passed with invalid transition, terminal lifecycle, and proof generation failure states: 1 file / 8 tests.
- [x] Focused order invalid-transition Playwright check passed across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari: 5 tests.
- [x] `pnpm nx run-many --target=test --all --skip-nx-cache --parallel=3` - shared-models 26 tests, ledger-api 241 tests, ledger-web 228 tests passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --workers=1 --reporter=line` - 604 passed, 16 skipped.
- [x] `pnpm nx run-many --target=build --all --skip-nx-cache --parallel=3` - all 9 build targets passed.
- [x] Added accepted-scan reduced-motion Playwright coverage and inventory failed-network state coverage across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- [x] Added login shell and orders list responsive/failed-network Playwright coverage across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 228 tests passed.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "reduced motion|failed network|horizontal viewport overflow|smoke journey|permission" --workers=1 --reporter=line` - 135 passed.
- [x] `git diff --check` - passed.
- [x] Inventory operation bands added for scan, bulk, and add-item workflows with no API behavior changes.
- [x] Compact import, bulk scan, and bulk move result-list styling added with explicit OK/ERR labels and rejected row classes.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 229 tests passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "lists, filters, and adds tenant inventory|imports CSV inventory|horizontal viewport overflow" --workers=1 --reporter=line` - 20 passed.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no inventory style-budget warning after SCSS trim.
- [x] Inventory table cleanup moved per-row quantity, status, reservation, movement, and removal controls behind a compact row action panel while preserving focused SKU, name, location, quantity, status, and actions columns.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 230 tests passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "lists, filters, and adds tenant inventory|reserves and releases available stock|reserves with timeout|moves stock|adjusts quantity|soft-removes" --workers=1 --reporter=line` - 30 passed.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no style-budget warnings.
- [x] `git diff --check` - passed.
- [x] Moved repeated inventory and order page styling into shared MD3 Expressive styles, reducing inventory component SCSS to 362 bytes and orders component SCSS to 176 bytes.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after shared MD3 style extraction.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 230 tests passed after shared MD3 style extraction.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings; inventory lazy module 71.02 kB and orders lazy module 80.86 kB.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "horizontal viewport overflow|lists, filters, and adds tenant inventory|orders list" --workers=1 --reporter=line` - 20 passed.
- [x] `git diff --check` - passed after shared MD3 style extraction.
- [x] Inventory long-running bulk actions now expose `aria-busy`, locked fieldsets, and visible status text for import, bulk scan, bulk move, and expired-reservation release workflows.
- [x] Focused inventory component spec passed with pending bulk-action assertions: 1 file / 26 tests.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 231 tests passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "locks bulk action controls|imports CSV inventory" --workers=1 --reporter=line` - 10 passed.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after bulk-action state cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after bulk-action e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after bulk-action state cleanup.
- [x] `git diff --check` - passed after bulk-action state cleanup.
- [x] PI-1 gamification and frontend UX docs reviewed for Sprint 4.5 adherence; Sprint 2-4 visual status now reflects completed shared-primitives work.
- [x] Frontend UX system now documents canonical feature-dashboard density, spacing, state-token, and operation-state rules.
- [x] Order proof panel now shows explicit unavailable, pending, failed, and verified proof states through shared trust/proof primitives and readable status text.
- [x] Order proof metadata is shown in a compact grid and raw proof JSON is kept behind a disclosure so long audit fields do not widen the viewport.
- [x] Focused order proof/detail component specs passed: 2 files / 14 tests.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 231 tests passed after order proof visual cleanup.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "order detail generates and verifies proof" --workers=1 --reporter=line` - 5 passed.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after order proof visual cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after order proof e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after order proof visual cleanup.
- [x] Device QR provisioning panel now uses MD3 tokens, stable visual selectors, wrapping API key text, stacked narrow actions, and constrained QR sizing for mobile widths.
- [x] Focused device registration component spec passed with QR provisioning layout selectors: 1 file / 9 tests.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 232 tests passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "QR provisioning panel|registers a device" --workers=1 --reporter=line` - 10 passed.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after QR provisioning layout cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after QR provisioning e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after QR provisioning layout cleanup.
- [x] Device fleet state visuals now use shared status chips for active, inactive, suspended, and revoked access states, plus shared connection-status primitives for online, disconnected, and failed heartbeat states.
- [x] Moved device fleet board/list styling into shared MD3 Expressive styles, reducing `devices.component.scss` to the component host rule.
- [x] Focused devices component spec passed with active, inactive, suspended, revoked, and failed-heartbeat primitive assertions: 1 file / 12 tests.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device fleet board exposes non-color visual states" --workers=1 --reporter=line` - 5 passed.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 232 tests passed after device fleet primitive cleanup.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after device fleet primitive cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after device fleet e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after device fleet MD3 style extraction.
- [x] `git diff --check` - passed after device fleet MD3 style extraction.
- [x] Order lifecycle rail now exposes accessible step labels and stable unit-test selectors, with shared MD3 wrapping rules for lifecycle titles, counts, labels, and state text.
- [x] Focused progress rail and order detail component specs passed with lifecycle step-label assertions: 2 files / 9 tests.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "lifecycle rail wraps labels" --workers=1 --reporter=line` - 5 passed.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 232 tests passed after lifecycle rail wrapping cleanup.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after lifecycle rail wrapping cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after lifecycle rail e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after lifecycle rail wrapping cleanup.
- [x] `git diff --check` - passed after lifecycle rail wrapping cleanup.
- [x] Inventory table row actions now use compact icon-plus-label controls for inspect, quantity, status, reservation, movement, and removal actions without changing accessible button names.
- [x] Focused inventory component spec passed with compact row action button assertions: 1 file / 26 tests.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "lists, filters, and adds tenant inventory" --workers=1 --reporter=line` - 5 passed after restarting the stale reused web server.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 232 tests passed after compact row action cleanup.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after compact row action cleanup.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after compact row action e2e update.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after compact row action cleanup.
- [x] `git diff --check` - passed after compact row action cleanup.
- [x] Shared visual primitives now expose scoped workflow-state selectors for status chips, severity chips, trust seals, connection status, progress rails, timeline rails, and ledger event cards.
- [x] Focused shared primitive component specs passed with selector assertions: 7 files / 20 tests.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device fleet board" --workers=1 --reporter=line` - 5 passed.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "inventory page lists|complete provenance chain|inventory alerts" --workers=1 --reporter=line` - 15 passed after opening the compact row action panel in the provenance scenario.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "invalid transition errors|completes the full lifecycle|lifecycle rail wraps" --workers=1 --reporter=line` - 15 passed.
- [x] `pnpm nx run ledger-web:test --skip-nx-cache` - 37 files / 232 tests passed after shared selector coverage.
- [x] `pnpm nx run ledger-web:lint --skip-nx-cache` - passed after shared selector coverage.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after shared selector e2e updates.
- [x] `pnpm nx run ledger-web:build --skip-nx-cache` - passed with no component style-budget warnings after shared selector coverage.
- [x] `git diff --check` - passed after shared selector coverage.
- [x] Cross-module audit consistency integration spec added for auth login, device registration, inventory add, and order creation ledger metadata.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache -- --runTestsByPath src/app/audit-consistency.integration.spec.ts` - 1 passed.
- [x] Full-stack Playwright API e2e now verifies auth, device, inventory, and order audit metadata through the ledger event list.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "consistent audit metadata" --workers=1 --reporter=line` - 1 passed, 4 intentionally skipped for single-browser backend API flow.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache` - 39 suites / 242 tests passed after audit consistency coverage.
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache` - passed after audit consistency coverage.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after audit consistency e2e coverage.
- [x] `pnpm nx run ledger-api:build --skip-nx-cache` - passed after audit consistency coverage.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache -- --runTestsByPath src/app/orders/orders.integration.spec.ts src/app/inventory/inventory.integration.spec.ts` - 2 suites / 27 tests passed after order idempotency, inventory import retry, and batch move retry coverage.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "order idempotency and inventory import retries" --workers=1 --reporter=line` - 1 passed, 4 intentionally skipped for the single-browser backend API flow.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache` - 39 suites / 245 tests passed after idempotency and retry coverage.
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache` - passed after idempotency and retry coverage.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after idempotency and retry e2e coverage.
- [x] `pnpm nx run ledger-api:build --skip-nx-cache` - passed after idempotency and retry coverage.
- [x] `git diff --check` - passed after idempotency and retry coverage.
- [x] Device service unit coverage now asserts status detail lookups include both device id and tenant id.
- [x] API integration coverage now verifies tenant-isolated device list/status reads and direct ledger event detail reads.
- [x] Full-stack Playwright API e2e now verifies device list/status and ledger event detail tenant isolation.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache -- --runTestsByPath src/app/devices/devices.service.spec.ts src/app/devices/devices.integration.spec.ts src/app/ledger-events/ledger-events.integration.spec.ts` - 3 suites / 39 tests passed after tenant-isolation coverage.
- [x] `pnpm nx e2e ledger-web-e2e --skip-nx-cache -- --grep "device lists, device status, and ledger event details tenant isolated" --workers=1 --reporter=line` - 1 passed, 4 intentionally skipped for the single-browser backend API flow.
- [x] `pnpm nx run ledger-api:test --skip-nx-cache` - 39 suites / 248 tests passed after tenant-isolation coverage.
- [x] `pnpm nx run ledger-api:lint --skip-nx-cache` - passed after tenant-isolation coverage.
- [x] `pnpm nx run ledger-web-e2e:lint --skip-nx-cache` - passed after tenant-isolation e2e coverage.
- [x] `pnpm nx run ledger-api:build --skip-nx-cache` - passed after tenant-isolation coverage.
- [x] `git diff --check` - passed after tenant-isolation coverage.
