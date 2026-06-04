# PI-1 Gamification & Visual Appeal Addendum

**Project:** True North Ledger  
**PI:** PI-1 - Core Platform Foundation  
**Purpose:** Add product delight, visual clarity, user motivation, and operational game loops without weakening the audit/security mission.

---

## Experience Vision

True North Ledger should feel like a **secure command center for truth, provenance, and operations**, not a dull compliance database.

The UI should communicate:

- Security
- Trust
- Progress
- Proof
- Operational readiness
- Real-time awareness
- Chain-of-custody confidence

Gamification should reward **accurate, auditable, complete work**. It should never reward reckless speed, security bypasses, fake productivity, or vanity metrics.

> Gamification supports truth. It never replaces truth.

---

## Core UX Stack

PI-1 should explicitly use the strengths of Angular and Material Design:

- Angular animations for route transitions, live-event highlights, expansion panels, timeline reveals, success confirmations, and connection-state changes
- Angular Material / Material Design 3 for cards, dialogs, chips, badges, stepper flows, sidenav, toolbar, tabs, snackbars, menus, tables, forms, and responsive layouts
- Material Design Icons for consistent entity/action recognition
- SCSS theme tokens for status, severity, trust, and proof states
- D3 or SVG later for provenance graphs, chain-of-custody trails, and operational dashboards
- Reduced-motion support for accessibility
- High-contrast and non-color-only status indicators

---

## Visual Metaphor

Use a **North Star / Mission Control / Ledger of Truth** metaphor.

Suggested visual language:

| Concept | Visual Treatment |
|---|---|
| Navigation | Compass / North Star motif |
| Ledger chain | Linked event rail, hash chain, proof seal |
| Device health | Signal pulse, online beacon, heartbeat sparkline |
| Auth/session | Shield, key, secure-session indicator |
| Orders | Lifecycle rail / mission progress |
| Inventory | Chain-of-custody path, location trail, scan pulse |
| Proofs | Seal, certificate, verified badge |
| Anomalies | Beacon, warning chip, investigation card |
| Real-time updates | Pulse animation, newest-event highlight |

---

## Gamification Vocabulary

Avoid childish game language in the product UI. Use serious operational language.

| Common Game Term | True North Ledger Term |
|---|---|
| XP | Integrity Points / Proof Points |
| Quest | Mission |
| Achievement | Badge / Seal |
| Level | Trust Tier / Readiness Tier |
| Streak | Reliability Streak |
| Score | Integrity Score / Completeness Score |
| Leaderboard | Team Health Board / Operations Board |
| Boss fight | Critical Resolution / Investigation |

---

## Gamification Guardrails

- [ ] No individual leaderboard for speed-sensitive work unless accuracy and audit completeness are weighted above speed
- [ ] No badges for bypassing controls, admin overrides, or risky behavior
- [ ] No client-generated badge/score state trusted as source-of-truth
- [ ] All gamified indicators must be derived from server-side trusted state or ledger events
- [ ] No public gamification display may expose private customer, user, tenant, or device data
- [ ] All badges/scores must be explainable by underlying events
- [ ] All animations must respect reduced-motion preferences
- [ ] Color must not be the only indicator of status, severity, success, or failure

---

## PI-Level Visual Acceptance Criteria

- [ ] Application has a consistent Material Design 3 visual language across dashboard, ledger, devices, orders, inventory, proofs, and settings
- [ ] Web, tablet, and mobile surfaces have clear layout intent even before full mobile/tablet optimization is complete
- [ ] Core entities have recognizable icons: users, services, devices, orders, inventory, proofs, anomalies, and ledger events
- [ ] Statuses use consistent color, icon, label, and shape language
- [ ] Ledger events include visual indicators for actor, subject, result, severity, and verification state
- [ ] Audit/proof views feel trustworthy, polished, readable, and easy to explain
- [ ] Angular route/page transitions are subtle, fast, and accessible
- [ ] Dashboard supports a first-pass command-center experience

---

## PI-Level Gamification Acceptance Criteria

- [ ] Define an initial gamification model based on trust, proof, reliability, and completion
- [ ] Add planning placeholder for `libs/experience-contracts` or `libs/gamification-contracts`
- [ ] Capture gamification-triggering events through the trusted ledger/event model where appropriate
- [ ] Add first-pass progress indicators for onboarding, device setup, order lifecycle, and inventory provenance
- [ ] Add badge/seal concepts as visual summaries, not source-of-truth records
- [ ] Add accessibility checks for badges, colors, animations, and notifications
- [ ] Ensure public proof pages show verification state without exposing private operational data

---

# Sprint Placement

## Sprint 0: Security & Quality Remediation

Sprint 0 remains security-first. Do not spend Sprint 0 polishing screens before the trust model is corrected.

### Additions

- [ ] Create `documentation/platform/experience-model.md`
- [ ] Define visual status vocabulary: `accepted`, `rejected`, `failed`, `pending`, `verified`, `unverified`, `revoked`
- [ ] Define severity vocabulary: `info`, `success`, `warning`, `danger`, `critical`
- [ ] Define reduced-motion requirements for Angular animations
- [ ] Document that gamification state must be server-derived and ledger-explainable
- [ ] Add TODO placeholder for `libs/experience-contracts` or `libs/gamification-contracts`

### Acceptance Criteria Additions

- [ ] Experience model exists before badges, points, seals, or trust indicators are implemented
- [ ] No gamification state is trusted from the browser/client
- [ ] Visual status/severity language is documented before feature UI expands

---

## Sprint 1: Authentication & Authorization Foundation

Sprint 1 is the right place to establish visual identity, secure-session UX, and role-aware navigation.

### Visual Appeal Additions

- [ ] Add Material Design 3 theme foundation with light/dark mode support
- [ ] Add `MatIconModule` and Material Icons usage guidelines
- [ ] Add polished application shell with toolbar, sidenav, route container, and responsive layout regions
- [ ] Add route transition animations using Angular animations
- [ ] Add secure-session indicator in the header
- [ ] Add user avatar/initials treatment
- [ ] Add role-aware navigation states with icons, badges, and short descriptions
- [ ] Add intentional 401/403 pages with calm security language
- [ ] Add reusable status/severity chip components

### Gamification Additions

- [ ] Add onboarding progress indicator for initial secure setup
- [ ] Add setup mission cards:
  - [ ] Configure admin user
  - [ ] Confirm tenant identity
  - [ ] Review assigned permissions
  - [ ] Run first protected API call
- [ ] Add first-pass profile/readiness panel showing role, permissions, and setup progress
- [ ] Add initial badge/seal concepts:
  - [ ] `First Secure Login`
  - [ ] `Protected Route Verified`
  - [ ] `Permission Denial Audited` for admin/auditor views only
- [ ] Add auth event cards with icons for login, logout, refresh, permission denied, and rate-limit events

### Sprint 1 Acceptance Criteria Additions

- [ ] Login flow feels like a secure product entry point, not a generated form
- [ ] Navigation visually reflects authenticated permissions
- [ ] Auth/security events are human-readable in ledger views
- [ ] Angular animations are subtle, fast, and accessibility-aware

---

## Sprint 2: Device Management & Identity

Sprint 2 should make device status and reliability instantly understandable.

### Visual Appeal Additions

- [ ] Build the device registry as a fleet command board, not just a table
- [ ] Add device-type icons for scanner, printer, sensor, kiosk, gateway, and tablet
- [ ] Add online/offline pulse indicators with text labels
- [ ] Add heartbeat sparkline or mini-chart for the last 24 hours
- [ ] Add device detail header with status seal, last seen, trust tier, and permission summary
- [ ] Add one-time API-key reveal dialog with strong visual warning and copy affordance
- [ ] Add animated device status transitions: registering, active, suspended, revoked

### Gamification Additions

- [ ] Add device setup checklist:
  - [ ] Registered
  - [ ] API key generated
  - [ ] First heartbeat received
  - [ ] First event submitted
  - [ ] Permissions verified
- [ ] Add device reliability indicators based on heartbeat consistency
- [ ] Add fleet health score based on online ratio, recent failures, revoked devices, and replay attempts
- [ ] Add device badges/seals:
  - [ ] `Registered Device`
  - [ ] `First Heartbeat`
  - [ ] `Reliable Signal`
  - [ ] `Revoked Safely`
  - [ ] `Replay Attempt Blocked` for admin/auditor views only
- [ ] Add device event timeline with distinct markers for heartbeat, auth, status, and ingestion events

### Sprint 2 Acceptance Criteria Additions

- [ ] Device status can be understood at a glance
- [ ] Device setup has a visible completion path
- [ ] Reliability indicators are derived from trusted device events
- [ ] Security-sensitive device events are visually highlighted for authorized users

---

## Sprint 3: Orders Module & Ledger Integration

Sprint 3 should make the order lifecycle feel like a guided mission with proof at the end.

### Visual Appeal Additions

- [ ] Upgrade order list with status chips, Material icons, quick filters, and summary cards
- [ ] Add visually rich order detail page with summary card, lifecycle rail, ledger event rail, and proof panel
- [ ] Add Angular animations for valid status transitions and newly appended order events
- [ ] Add timeline icons for each order event type
- [ ] Display proof hash as a seal/card, not raw text only
- [ ] Add copy/download/verify proof actions with clear hierarchy
- [ ] Add polished empty states for no orders, no proofs, and no search results

### Gamification Additions

- [ ] Add order lifecycle progress rail:
  - [ ] Pending
  - [ ] Confirmed
  - [ ] Processing
  - [ ] Shipped
  - [ ] Delivered
  - [ ] Cancelled/Failed branch
- [ ] Add order completeness score based on required fields, valid status transitions, proof generation, and complete audit trail
- [ ] Add milestone seals:
  - [ ] `Order Created`
  - [ ] `Order Confirmed`
  - [ ] `Proof Generated`
  - [ ] `Chain Verified`
  - [ ] `Delivered Complete`
- [ ] Add operations mission cards:
  - [ ] Confirm pending orders
  - [ ] Resolve failed transitions
  - [ ] Generate proofs for completed orders
  - [ ] Review cancelled order reasons
- [ ] Add restrained success animation after valid proof generation

### Sprint 3 Acceptance Criteria Additions

- [ ] Order status is visually obvious without opening raw ledger data
- [ ] Order timeline clearly maps business status to ledger events
- [ ] Proof generation feels trustworthy and understandable
- [ ] Order milestone indicators are backed by actual order/ledger state

---

## Sprint 4: Inventory Module & Provenance

Sprint 4 is the showcase sprint for visual storytelling. Inventory provenance should become one of the most impressive parts of the product.

### Visual Appeal Additions

- [ ] Add inventory dashboard cards for total items, low stock, anomalies, scan volume, and location distribution
- [ ] Add inventory provenance timeline with icons, connecting lines, actor labels, and location/quantity deltas
- [ ] Add location-history diagram for item movement
- [ ] Add animated scan acceptance/rejection feedback
- [ ] Add scanner-friendly tablet/mobile scan surface with large touch targets
- [ ] Add anomaly cards with severity icon, affected item, cause, and resolution action
- [ ] Add visual chain-of-custody component that can later evolve into D3/SVG graph visualization

### Gamification Additions

- [ ] Add inventory chain-of-custody completeness indicator
- [ ] Add scan workflow feedback:
  - [ ] Valid scan accepted
  - [ ] Wrong-location warning
  - [ ] Unknown SKU warning
  - [ ] Duplicate/repeated scan notice
- [ ] Add inventory badges/seals:
  - [ ] `Provenance Complete`
  - [ ] `First Scan`
  - [ ] `Location Verified`
  - [ ] `Low Stock Resolved`
  - [ ] `Anomaly Resolved`
- [ ] Add operational mission cards:
  - [ ] Resolve low stock
  - [ ] Investigate wrong-location scan
  - [ ] Complete missing provenance trail
  - [ ] Review stale inventory
- [ ] Add team-level inventory health score based on provenance completeness, unresolved anomalies, low-stock count, and scan freshness

### Sprint 4 Acceptance Criteria Additions

- [ ] Inventory provenance is visually traceable without reading raw JSON
- [ ] Scan interactions give fast, clear feedback for tablet/mobile workflows
- [ ] Anomaly resolution feels like an investigation workflow, not a plain error list
- [ ] Inventory health indicators are derived from ledger/inventory state

---

## Sprint 5: WebSocket Notifications & Production Infrastructure

Sprint 5 should make the system feel alive. This is where real-time UX, animated updates, and operational dashboards come together.

### Visual Appeal Additions

- [ ] Add real-time event feed with newest-event highlight animation
- [ ] Add WebSocket connection status indicator with icon, label, and subtle pulse
- [ ] Add notification dropdown with category icons and severity chips
- [ ] Add dashboard panels for ledger event rate, device health, order activity, inventory alerts, and system health
- [ ] Add Grafana dashboard links/cards from the app dashboard
- [ ] Add polished loading, reconnecting, offline, empty, and error states
- [ ] Add reduced-motion alternative for all real-time animations

### Gamification Additions

- [ ] Add live operations board showing team-level readiness and health metrics
- [ ] Add mission-completion summary for the PI demo:
  - [ ] Auth secured
  - [ ] Devices connected
  - [ ] Orders audited
  - [ ] Inventory traced
  - [ ] Notifications live
  - [ ] Monitoring online
- [ ] Add system readiness score based on health checks, test pass status, service uptime, and ledger write success
- [ ] Add notification-based achievement/seal events where appropriate:
  - [ ] `First Live Event`
  - [ ] `Monitoring Online`
  - [ ] `Proof Flow Complete`
  - [ ] `Full Chain Demonstrated`
- [ ] Add PI demo mode route or dashboard panel for showcasing the complete platform story

### Sprint 5 Acceptance Criteria Additions

- [ ] Real-time updates are visually clear without being noisy
- [ ] Connection and system health are understandable at a glance
- [ ] PI demo tells a coherent visual story from auth to device to order to inventory to proof
- [ ] Live visual effects remain accessible and do not hide audit details

---

## Recommended Angular/Material Implementation Backlog

### Foundation Components

- [ ] `StatusChipComponent`
- [ ] `SeverityChipComponent`
- [ ] `TrustSealComponent`
- [ ] `MissionCardComponent`
- [ ] `ProgressRailComponent`
- [ ] `LedgerEventCardComponent`
- [ ] `ProofHashCardComponent`
- [ ] `ConnectionStatusComponent`
- [ ] `EmptyStateComponent`
- [ ] `TimelineRailComponent`

### Angular Animation Triggers

- [ ] `routeFadeSlide`
- [ ] `cardEnter`
- [ ] `eventHighlight`
- [ ] `statusPulse`
- [ ] `expandCollapse`
- [ ] `proofVerified`
- [ ] `scanAccepted`
- [ ] `scanRejected`
- [ ] `connectionStateChange`

### Material Modules Likely Needed

- [ ] `MatToolbarModule`
- [ ] `MatSidenavModule`
- [ ] `MatIconModule`
- [ ] `MatButtonModule`
- [ ] `MatCardModule`
- [ ] `MatChipsModule`
- [ ] `MatBadgeModule`
- [ ] `MatTooltipModule`
- [ ] `MatDialogModule`
- [ ] `MatSnackBarModule`
- [ ] `MatTabsModule`
- [ ] `MatStepperModule`
- [ ] `MatTableModule`
- [ ] `MatPaginatorModule`
- [ ] `MatSortModule`
- [ ] `MatFormFieldModule`
- [ ] `MatInputModule`
- [ ] `MatSelectModule`
- [ ] `MatMenuModule`
- [ ] `MatProgressBarModule`
- [ ] `MatProgressSpinnerModule`

---

## Suggested Icon Map

| Entity / Action | Material Icon Ideas |
|---|---|
| Dashboard | `dashboard`, `space_dashboard` |
| Ledger | `receipt_long`, `history_edu`, `account_tree` |
| Proof | `verified`, `workspace_premium`, `fact_check` |
| Security | `shield`, `lock`, `key` |
| User | `person`, `badge` |
| Service | `api`, `hub` |
| Device | `devices`, `qr_code_scanner`, `sensors` |
| Gateway | `router`, `settings_input_antenna` |
| Orders | `shopping_cart`, `local_shipping`, `assignment` |
| Inventory | `inventory_2`, `warehouse`, `category` |
| Scan | `qr_code_scanner`, `document_scanner` |
| Alert | `warning`, `notification_important` |
| Success | `check_circle`, `verified` |
| Failure | `error`, `dangerous` |
| Revoked | `block`, `remove_circle` |
| Real-time | `stream`, `sync`, `online_prediction` |
| Monitoring | `monitoring`, `query_stats`, `speed` |

---

## UX Definition of Done Additions

A visual/gamification task is complete only when:

- [ ] It is backed by trusted server state or ledger events where applicable
- [ ] It works at desktop, tablet, and mobile breakpoints or has a documented limitation
- [ ] It has accessible labels/tooltips
- [ ] It does not rely on color alone
- [ ] It respects reduced-motion preferences
- [ ] It does not leak sensitive audit data
- [ ] It has unit/E2E coverage where behavior is meaningful
- [ ] It improves clarity, motivation, or operational confidence

---

## Product Warning

The gamification layer must never become the product's source of truth.

The correct hierarchy is:

```text
Postgres ledger state
  ↓
Server-side derived status/progress
  ↓
UI visualization / badges / seals / animations
```

Not:

```text
Browser badge state
  ↓
Trust decision
```

True North Ledger earns trust by proving what happened. The UI should make that proof beautiful, fast, and understandable.
