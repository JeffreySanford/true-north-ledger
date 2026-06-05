# Sprint 1: Authentication & Authorization Foundation

**Sprint Duration:** 2 weeks (June 3 - June 16, 2026)  
**Sprint Goal:** Turn the Sprint 0 auth guard foundation into a product RBAC system with users, roles, permissions, session UX, and role-specific web/tablet/mobile route gating.

---

## Sprint Acceptance Criteria

- [x] JWT-based authentication working for `user` actors
- [x] RBAC roles seeded for admin, operations manager, inventory, shipping, billing, moderator, auditor, device technician, support, and viewer
- [x] User-role assignment and route permission metadata implemented
- [x] Service token authentication implemented
- [x] Permission guard system operational across all endpoints
- [x] Web navigation only exposes routes allowed by the user permissions
- [x] Tablet and mobile navigation only expose routes allowed by the user permissions
- [x] Auth-related ledger events captured (login, logout, permission denied)
- [x] Rate limiting active on all public endpoints
- [x] Secure auth UX and role-aware navigation are implemented in the web shell
- [x] Shared MD3 style foundation, icon registry, and animation primitives are available for PI-1 frontend work
- [x] Integration tests validate auth flows and permission enforcement

---

## Daily Task Breakdown

### Backend Authentication Module

#### Auth Module Setup
- [x] Extend existing `auth` module created during Sprint 0
- [x] Add `auth` controller for login/logout/refresh endpoints
- [x] Add `auth` service for credential validation and token lifecycle
- [x] Add `users` module for user records, status, and tenant membership
- [x] Add `roles` module for RBAC role and permission assignment
- [x] Install remaining dependency if local username/password strategy is used: `passport-local` (not required for current JWT-only flow)
- [x] Install remaining type if local username/password strategy is used: `@types/passport-local` (not required for current JWT-only flow)

#### JWT Authentication Strategy
- [x] Create `JwtStrategy` class extending `PassportStrategy`
- [x] Configure JWT secret from environment variables
- [x] Fail startup when required auth secrets are missing
- [x] Implement JWT payload validation
- [x] Extract user/actor information from JWT
- [x] Add tenant_id to JWT payload
- [x] Create `JwtAuthGuard` extending `AuthGuard('jwt')`
- [x] Test JWT strategy with valid tokens
  - [x] Test JWT strategy with expired tokens
  - [x] Test JWT strategy with invalid signatures

#### Service Token Strategy
- [x] Create `ServiceTokenStrategy` class
- [x] Implement service token validation from database
- [x] Add service token to database schema (service_tokens table)
- [x] Create ServiceToken entity with TypeORM
- [x] Add token hashing (bcrypt or SHA-256)
- [x] Store raw service tokens only once at creation; persist hashed token values only
- [x] Implement token revocation check
- [x] Create `ServiceAuthGuard` extending `AuthGuard('service')`
- [x] Test service token authentication
- [x] Test revoked token rejection

#### Auth Controller Endpoints
- [x] `POST /api/v1/auth/login` - User login endpoint
  - [x] Validate credentials (username/password)
  - [x] Generate JWT token
  - [x] Create LOGIN_SUCCESS ledger event
  - [x] Return token and user info
  - [x] Create LOGIN_FAILED ledger event
- [x] `POST /api/v1/auth/logout` - User logout endpoint
  - [x] Validate JWT token
  - [x] Create LOGOUT ledger event
  - [x] Invalidate token (add to blacklist in Redis)
- [x] `POST /api/v1/auth/refresh` - Token refresh endpoint
  - [x] Validate refresh token
  - [x] Generate new access token
  - [x] Create TOKEN_REFRESHED event
- [x] `POST /api/v1/auth/service-token` - Generate service token
  - [x] Admin-only endpoint
  - [x] Create service token with scoped permissions
  - [x] Store hashed token in database
  - [x] Create SERVICE_TOKEN_CREATED event
- [x] `DELETE /api/v1/auth/service-token/:id` - Revoke service token
  - [x] Admin-only endpoint
  - [x] Mark token as revoked
  - [x] Create SERVICE_TOKEN_REVOKED event

#### Permissions Guard System
- [x] Extend existing `PermissionsGuard` from Sprint 0 to use granular permission names
- [x] Extend existing `@RequirePermissions()` decorator to support route metadata consistently
- [x] Implement RBAC permission check logic
  - [x] Extract actor permissions from request
  - [x] Resolve user roles to permission grants
  - [x] Compare with required permissions
  - [x] Allow if actor has all required permissions
- [x] Create PERMISSION_DENIED ledger event on failure
- [x] Add tenant isolation check
- [x] Test permissions guard with various permission sets
- [x] Test multi-permission requirements
- [x] Test tenant isolation enforcement

#### Rate Limiting
- [x] Install `@nestjs/throttler` package
- [x] Configure ThrottlerModule with Redis storage
- [x] Apply global rate limiting (100 requests/minute default)
- [x] Add stricter limits to auth endpoints (5 login attempts/minute)
- [x] Create RATE_LIMIT_EXCEEDED ledger event
- [x] Test rate limiting enforcement
- [x] Test rate limit reset after time window

#### Auth Ledger Events
- [x] Create auth event types in ledger-contracts
  - [x] LOGIN_SUCCESS
  - [x] LOGIN_FAILED
  - [x] LOGOUT
  - [x] TOKEN_REFRESHED
  - [x] SERVICE_TOKEN_CREATED
  - [x] SERVICE_TOKEN_REVOKED
  - [x] PERMISSION_DENIED
  - [x] RATE_LIMIT_EXCEEDED
- [x] Integrate auth events with LedgerEventsService
- [x] Capture complete metadata (actor, IP, user agent, result)
- [x] Test auth event creation for each scenario

#### Tenant Isolation
- [x] Add tenant_id extraction from JWT
- [x] Create `@Tenant()` decorator for request context
- [x] Modify all database queries to filter by tenant_id
- [x] Add tenant validation to auth guards
- [x] Test cross-tenant access prevention
- [x] Create TENANT_ISOLATION_VIOLATION event for violations

#### RBAC Roles and Permissions
- [x] Implement default roles from `documentation/platform/rbac-and-views.md`
- [x] Implement permission catalog using dot-case names such as `ledger.read`, `orders.status.write`, and `devices.manage`
- [x] Seed default role-permission mappings per tenant
- [x] Add admin-only role assignment endpoint
- [x] Add user deactivation endpoint
- [x] Add role assignment audit events
- [x] Test admin can assign roles
- [x] Test non-admin cannot assign roles
- [x] Test multiple roles merge permissions correctly

#### Unit Tests (Behavior Coverage)
- [x] Auth service tests
  - [x] Test login with valid credentials
  - [x] Test login with invalid credentials
  - [x] Test token generation
  - [x] Test token validation
  - [x] Test service token creation
  - [x] Test service token validation
  - [x] Test user deactivation and active-state enforcement
  - [x] Test persistence-backed user-role record state transitions for assignment/deactivation
  - [x] Test auth event metadata capture forwards source IP, user agent, and correlation id
- [x] JWT strategy tests
  - [x] Test valid JWT validation
  - [x] Test expired JWT rejection
  - [x] Test invalid signature rejection
  - [x] Test tenant extraction
- [x] Permissions guard tests
  - [x] Test permission grant
  - [x] Test permission denial
  - [x] Test multiple permission requirements
  - [x] Test tenant isolation
- [x] Rate limiting tests
  - [x] Test rate limit enforcement
  - [x] Test rate limit reset
  - [x] Test different limits per endpoint

#### Integration Tests
- [x] Login flow integration test
  - [x] POST /auth/login with valid credentials returns JWT
  - [x] POST /auth/login with invalid credentials returns 401
  - [x] LOGIN_SUCCESS event created on success
  - [x] LOGIN_FAILED event created on failure
  - [x] Auth event metadata persists actor, source IP, user agent, and accepted result
- [x] Protected endpoint integration test
  - [x] Request with valid JWT succeeds
  - [x] Request without JWT returns 401
  - [x] Request with expired JWT returns 401
  - [x] Request with invalid JWT returns 401
  - [x] Browser-to-API-to-database-to-UI JWT path remains covered by full-stack E2E
- [x] Permissions integration test
  - [x] Request with required permissions succeeds
  - [x] Request without required permissions returns 403
  - [x] PERMISSION_DENIED event created on denial
  - [x] Deactivated users are denied protected API access
  - [x] Endpoint permission matrix enforces auth and ledger route requirements
  - [x] User-role assignment and deactivation are persisted in tenant user-role records
- [x] Service token integration test
  - [x] Create service token as admin
  - [x] Authenticate with service token
  - [x] Revoked service token rejected
  - [x] Persist hashed service token and revocation state in database
  - [x] Admin deactivation endpoint blocks protected API access for deactivated users
- [x] Rate limiting integration test
  - [x] Exceed rate limit returns 429
  - [x] Rate limit resets after time window
  - [x] RATE_LIMIT_EXCEEDED event created

#### OpenAPI Documentation
- [x] Add Swagger decorators to auth controller
- [x] Document request/response schemas
- [x] Add authentication examples
- [x] Document error responses
- [x] Add security scheme definitions

---

### Contract Library Updates

#### Auth Contracts Extension
- [x] Create JWT payload schema (user_id, actor_type, tenant_id, permissions, exp, iat)
- [x] Add role schema and role assignment schema
- [x] Add login request schema (username, password)
- [x] Add login response schema (access_token, refresh_token, user_info)
- [x] Create service token schema (name, permissions, scopes)
- [x] Add permission enum values from `documentation/platform/rbac-and-views.md`
- [x] Create actor type enum (`user`, `service`, `device`, `system`)
- [x] Add validation for permission combinations
- [x] Export all schemas from auth-contracts index

#### Shared Models Updates
- [x] Add User type definition
- [x] Add Role and Permission type definitions
- [x] Add ServiceToken type definition
- [x] Create auth error types
- [x] Add rate limit error schema

---

### Frontend Authentication

#### Auth Service
- [x] Create `auth.service.ts` in ledger-web
- [x] Implement login method
  - [x] POST to /api/v1/auth/login
  - [x] Decide token storage model; prefer HttpOnly, Secure, SameSite cookies unless API/client constraints require otherwise
  - [x] Do not commit static frontend tokens or fallback JWTs
  - [x] Remove static localhost/dev token fallback; require stored login or explicit test auth state
  - [x] Store user info in memory
  - [x] Emit authentication state change
- [x] Implement logout method
  - [x] POST to /api/v1/auth/logout
  - [x] Clear stored tokens
  - [x] Clear user info
  - [x] Navigate to login page
- [x] Implement token refresh logic
  - [x] Auto-refresh before expiration
  - [x] Handle refresh failures
- [x] Create auth state observable (logged in/out)
- [x] Add getCurrentUser() method
- [x] Add hasPermission() method for UI conditional rendering
- [x] Add unit tests for auth service state and permission helpers
  - [x] Test `getCurrentUser()` returns restored user
  - [x] Test `hasPermission()` returns correct permission state
  - [x] Test `isAuthenticated$` emits expected authentication status

#### Login Page Component
- [x] Create login page component
- [x] Build login form with reactive forms
  - [x] Username field with validation
  - [x] Password field with validation
  - [x] Remember me checkbox (optional)
  - [x] Login button
- [x] Display login errors (invalid credentials, network errors)
- [x] Show loading state during login
- [x] Redirect to dashboard after successful login
- [x] Add forgot password link (placeholder for PI-2)
- [x] Add login component unit tests
  - [x] Test validation error display
  - [x] Test login submission calls AuthService and redirects
  - [x] Test intended-route redirect after protected-route login
  - [x] Test loading state while login request is pending

#### Visual & Gamification Foundation
- [x] Add Angular Material 3 theme support and shared SCSS tokens
- [x] Keep `apps/ledger-web/src/styles.scss` as the global entrypoint for shared style partials
- [x] Expand `apps/ledger-web/src/styles/_material.scss` for reusable Angular Material overrides
- [x] Expand `apps/ledger-web/src/styles/_components.scss` for reusable app-level UX classes
- [x] Register Material Icons and audit/status iconography
- [x] Add secure session chip and login state indicator to the shell
- [x] Add route transition and card animation foundation
  - [x] Create shared animation trigger module for `routeFadeSlide`, `cardEnter`, `eventHighlight`, `statusPulse`, and `expandCollapse`
  - [x] Ensure animation triggers honor reduced-motion rules
- [x] Add reduced-motion and high-contrast support
- [x] Prototype mission card or onboarding checklist for first-time auth users
- [x] Create first shared UX primitives: status chip, severity chip, trust seal, mission card, connection status, and empty state
  - [x] Create `StatusChipComponent`
  - [x] Create `SeverityChipComponent`
  - [x] Create `TrustSealComponent`
  - [x] Create `MissionCardComponent`
  - [x] Create `ProgressRailComponent`
  - [x] Create `LedgerEventCardComponent`
  - [x] Create `ProofHashCardComponent`
  - [x] Create `ConnectionStatusComponent`
  - [x] Create `TimelineRailComponent`
  - [x] Create `EmptyStateComponent`
  - [x] Add unit tests for shared visual primitive state variants
  - [x] Add unit tests for status chip, trust seal, and empty state variants
  - [x] Add unit tests for severity chip and mission card variants
  - [x] Add unit tests for progress rail step states and completion summary
  - [x] Add unit tests for connection status variants
  - [x] Add unit tests for ledger event card summary and result states
- [x] Write unit tests for auth shell, secure nav, and permission visibility

#### HTTP Interceptor
- [x] Create auth.interceptor.ts
- [x] Add Authorization header with JWT to all requests
- [x] Handle 401 responses (redirect to login)
- [x] Handle 403 responses (show permission error)
- [x] Handle token refresh on 401
- [x] Exclude login endpoint from auth header
- [x] Add unit tests for auth interceptor
  - [x] Test auth header is attached to non-auth requests
  - [x] Test auth header is not attached to auth endpoints
  - [x] Test 401 response redirects to login
  - [x] Test 403 handling once implemented

#### Auth Guard
- [x] Create auth.guard.ts implementing CanActivate
- [x] Check authentication state
- [x] Redirect to login if not authenticated
- [x] Store intended URL for post-login redirect
- [x] Check route-specific permissions
- [x] Check route surface metadata (`web`, `tablet`, `mobile`, `public`)
- [x] Add unit tests for auth guard
  - [x] Test authenticated user is allowed
  - [x] Test unauthenticated user is redirected
  - [x] Test route metadata-based guard behavior once implemented

#### Auth State Management
- [x] Create auth state using Angular signals or RxJS
- [x] Track logged in/out status
- [x] Track current user info
- [x] Track user permissions
- [x] Expose isAuthenticated$ observable
- [x] Expose currentUser$ observable

#### UI Integration
- [x] Add login/logout button to app header
- [x] Display current user name when logged in
- [x] Show user avatar or initials
- [x] Add protected route guards to all secure routes
- [x] Update navigation to show/hide items based on permissions
- [x] Treat the first seeded local admin user as the admin persona until full user management replaces it

#### Role-Specific Route Groups
- [x] Define route metadata for web routes in `documentation/platform/rbac-and-views.md`
- [x] Add planned web route entries for dashboard, ledger events, orders, inventory, shipping, billing, moderation, devices, proofs, users, roles, and settings
- [x] Add planned tablet route entries for receiving, counts, pick-pack, labeling, device pairing, and supervisor views
- [x] Add planned mobile route entries for scan, inventory lookup, order lookup, approve, device, proof, and alerts views
- [x] Ensure unavailable routes hide from navigation and return a 403-safe page if visited directly

#### Unit Tests
- [x] Auth service tests
  - [x] Test login success
  - [x] Test login failure
  - [x] Test logout
  - [x] Test token storage
  - [x] Test token refresh
  - [x] Test automatic pre-expiry refresh scheduling
  - [x] Test refresh failure clears session and requires re-authentication
  - [x] Test permission checks
  - [x] Test `getCurrentUser()` and auth state
  - [x] Test `hasPermission()` behavior
  - [x] Test `isAuthenticated$` and `currentUser$`
  - [x] Test no static development session is created without stored login
- [x] Login component tests
  - [x] Test validation error display
  - [x] Test login submission and navigation
  - [x] Test login error display
- [x] Auth guard tests
  - [x] Test authenticated user allowed
  - [x] Test unauthenticated user redirected
  - [x] Test intended URL stored
- [x] Auth interceptor tests
  - [x] Test auth header added
  - [x] Test auth endpoint exclusion
  - [x] Test 401 handling
  - [x] Test 403 handling
- [x] Remove remaining unit-test lint warnings (`no-explicit-any`) from auth and login spec suites
- [x] Add unit tests validating route metadata coverage for protected web/tablet/mobile planned routes

---

### E2E Testing (Playwright)

#### Login Flow E2E Tests
- [x] Test successful login flow
  - [x] Navigate to login page
  - [x] Enter valid credentials
  - [x] Click login button
  - [x] Verify submit button is disabled while authentication is pending
  - [x] Verify redirect to dashboard
  - [x] Verify auth token stored
  - [x] Verify user info displayed
- [x] Test failed login flow
  - [x] Enter invalid credentials
  - [x] Verify error message displayed or login remains on page
  - [x] Verify no redirect
  - [x] Verify no token stored
- [x] Test logout flow
  - [x] Login first
  - [x] Click logout button
  - [x] Verify redirect to login
  - [x] Verify token cleared
  - [x] Verify user info cleared

#### Protected Route E2E Tests
- [x] Test unauthenticated access redirects to login
  - [x] Navigate to /dashboard without login
  - [x] Verify redirect to /login
  - [x] Verify intended URL stored
- [x] Test authenticated access allowed
  - [x] Login successfully
  - [x] Navigate to /dashboard
  - [x] Verify dashboard content displayed
- [x] Test post-login redirect to intended URL
  - [x] Try to access /orders without auth
  - [x] Login successfully
  - [x] Verify redirect to /orders
- [x] Test protected route access with auth guard
  - [x] Verify login redirect occurs for protected route
  - [x] Verify authenticated user can access protected route
  - [x] Verify protected route is hidden for unauthenticated nav
  - [x] Verify 401 protected API responses trigger refresh and request retry
  - [x] Verify refresh failure redirects to login and clears session

#### Permission-Based Access E2E Tests
- [x] Test user with permissions can access route
  - [x] Login as admin user
  - [x] Navigate to admin-only page
  - [x] Verify page content displayed
- [x] Test user without permissions sees error
  - [x] Login as regular user
  - [x] Try to navigate to admin page
  - [x] Verify permission error displayed
  - [x] Verify no sensitive data exposed
- [x] Test tablet route access by role
- [x] Test mobile route access by role
- [x] Test admin sees current full navigation set
- [x] Test direct API permission denial via full-stack JWT suite
- [x] Test direct API service token authentication via full-stack JWT suite
- [x] Test permission-aware navigation hides unauthorized routes and surfaces secure session state
- [x] Seed authenticated E2E state explicitly instead of relying on frontend fallback tokens
- [x] Test secure session chip, role-aware Material Icons, and mission/onboarding state render from authenticated server state
- [x] Test reduced-motion mode keeps route and card transitions usable without motion-dependent cues
- [x] Test shared visual primitives render accessible names, non-color state text, and responsive layouts
- [x] Test no horizontal overflow or clipped chip/card/rail text in auth and dashboard surfaces
- [x] Remove remaining Playwright lint warnings from login auth-flow coverage
- [x] Add E2E checks for planned route-group permission denial and safe unauthorized fallback
- [x] Add E2E checks for planned route-group permission allow matrix across web/tablet/mobile surfaces

#### Frontend Quality Gates
- [x] Migrate inline `*ngFor` templates to built-in control flow where required by lint rules
#### Auth Audit Trail E2E Tests
- [x] Test login creates audit event
  - [x] Login successfully
  - [x] Navigate to ledger events page
  - [x] Verify LOGIN_SUCCESS event visible
  - [x] Verify event metadata complete
  - [x] Verify source IP and user agent metadata are visible
- [x] Test failed login creates audit event
  - [x] Attempt login with bad credentials
  - [x] Navigate to ledger events page (as admin)
  - [x] Verify LOGIN_FAILED event visible
- [x] Test permission denial creates audit event
  - [x] Login as regular user
  - [x] Try to access admin endpoint
  - [x] Check ledger for PERMISSION_DENIED event
- [x] Test logout creates audit event includes metadata visibility
- [x] Test logout creates audit event
  - [x] Login and logout
  - [x] Login again as admin and navigate to ledger events
  - [x] Verify LOGOUT event visible
- [x] Test token refresh creates audit event
  - [x] Trigger refresh from authenticated session
  - [x] Verify TOKEN_REFRESHED event visible with metadata

---

### Documentation

#### Technical Documentation
- [x] Document authentication architecture in `documentation/platform/security-model.md`
- [x] Add JWT token structure reference
- [x] Keep `documentation/platform/rbac-and-views.md` updated with the implemented role and permission matrix
- [x] Create auth endpoint API reference
- [x] Document service token creation and management
- [x] Add rate limiting configuration guide

#### Integration Guides
- [x] Create "Getting Started with Authentication" guide
- [x] Document login flow for frontend developers
- [x] Create service token integration guide for partners
- [x] Add auth troubleshooting guide
- [x] Document permission configuration

#### README Updates
- [x] Add authentication setup instructions
- [x] Document environment variables for auth
- [x] Add auth testing instructions
- [x] Update quick start guide with login step

---

## Definition of Done

**Local closeout check:** 2026-06-04

A task is considered complete when:
- [x] Code written and follows coding standards
- [x] Unit tests written and passing (90%+ coverage for new code)
- [x] Integration tests written and passing
- [x] E2E tests written and passing (where applicable)
- [x] Code reviewed and approved
- [x] OpenAPI documentation updated
- [x] Technical documentation updated
- [x] No critical or high severity bugs
- [x] Deployed to development environment and tested
- [x] Demo-ready for sprint review

Closeout gate results:
- [x] `pnpm nx run-many -t lint`
- [x] `pnpm nx run-many -t test`
- [x] `pnpm nx run-many -t build`
- [x] `pnpm nx e2e ledger-web-e2e`
- [x] `pnpm audit --audit-level moderate`
- [x] `pnpm nx run-many -t test -- --coverage` runs successfully
- [x] `pnpm nx run-many -t test --coverage --skip-nx-cache`
- [x] `pnpm audit --audit-level high`
- [x] `pnpm docker:up`
- [x] Development smoke test: `GET http://localhost:3000/api` returned 200 and `GET http://localhost:4200/` returned 200

Formal closeout notes:
- Sprint 1 is locally closed as of 2026-06-04 after full lint, test, build, audit, Docker, E2E, and development smoke gates passed.
- Formal review/approval was completed before commit `38fb91f complete sprint 1 auth closeout` was pushed to `origin/main`.
- Coverage threshold enforcement remains a Sprint 2 process-hardening follow-up. Current local web coverage from closeout was 91.41% statements, 96.41% functions, and 92.99% lines; branches were 83.92% because Angular template/compiler branches and placeholder pages are included in aggregate reporting.
- The local development environment was smoke-tested and demo-ready at `http://localhost:4200/` with API docs available at `http://localhost:3000/api/docs`.
- Sprint 2 continuation on 2026-06-04 revalidated Sprint 1 auth/RBAC behavior through full lint, build, coverage tests, audit, and Playwright gates while adding device nonce replay protection and route-scoped per-device throttling.
- Sprint 2 continuation on 2026-06-04 added device event payload size validation with unit, integration, and E2E coverage without changing Sprint 1 auth closeout status.
- Sprint 2 continuation on 2026-06-04 added browser E2E coverage for device API key and QR provisioning payload copy-to-clipboard behavior.
- Sprint 2 continuation on 2026-06-04 added browser E2E coverage for device registry status, type, and search filtering.
- Sprint 2 continuation on 2026-06-04 added server-backed device registry pagination with API, unit, integration, and browser E2E coverage.
- Sprint 2 continuation on 2026-06-04 added registry-level device status and revocation unit/E2E coverage.
- Sprint 2 continuation on 2026-06-04 added device detail status, metadata, permissions, and audit event stream unit/E2E coverage.
- Sprint 2 continuation on 2026-06-05 added device detail heartbeat history with unit and browser E2E coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added degraded-heartbeat failure tracking and auto-suspend behavior with API unit, API integration, frontend unit, and browser E2E coverage.
- Sprint 2 continuation on 2026-06-05 added polling-backed device status observability with frontend unit and browser E2E coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added the formal device-key authentication strategy with focused API unit coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added device status-management confirmation and audit-trail controls with frontend unit and browser E2E coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 extracted the device registration component with frontend unit and browser E2E coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added browser E2E coverage for device registration, status change, revocation, and ledger-events audit visibility while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added shared-primitives device empty/loading/error states with frontend unit and browser E2E coverage while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added device event visibility coverage from registration through device-event ingestion to the detail audit stream while preserving Sprint 1 closeout status.
- Sprint 2 continuation on 2026-06-05 added schema-validated device hardware examples, OpenAPI examples, README device setup/testing notes, and the device event ingestion guide while preserving Sprint 1 closeout status.

---

## Sprint Risks

### High Priority Risks
- **JWT Secret Management:** Ensure JWT secrets are never committed to git (mitigation: use .env files, validate in CI)
- **Token Storage Security:** XSS attacks can steal browser-readable tokens (mitigation: prefer HttpOnly Secure cookies, add CSP headers)
- **Transport Security:** Credentials must rely on HTTPS/TLS in deployed environments; browser-side encryption is not a replacement for TLS
- **Rate Limiting Bypass:** Distributed attacks could bypass rate limits (mitigation: test with multiple IPs, consider WAF)

### Medium Priority Risks
- **Password Storage:** Weak hashing could compromise security (mitigation: use bcrypt with high rounds, salt all passwords)
- **Session Management:** Long-lived tokens increase risk (mitigation: short access token TTL, refresh token rotation)

---

## Sprint Retrospective Topics

- Effectiveness of test-driven development approach
- Auth library choices (Passport.js vs alternatives)
- Contract library synchronization challenges
- Frontend state management for auth
- Rate limiting strategy effectiveness
- Documentation clarity and completeness

---

## Next Sprint Preview (Sprint 2: Device Management)

Key dependencies from Sprint 1:
- JWT authentication must be complete
- Permission guard system operational
- Service token strategy working
- Ledger event integration tested

Sprint 2 will build on this foundation to add:
- Device-specific authentication
- Device registration flow
- Device event ingestion
- Device management UI
