# Sprint 1: Authentication & Authorization Foundation

**Sprint Duration:** 2 weeks (June 3 - June 16, 2026)  
**Sprint Goal:** Implement secure multi-actor authentication with scoped permissions and audit events.

---

## Sprint Acceptance Criteria

- [ ] JWT-based authentication working for USER actors
- [ ] Service token authentication implemented
- [ ] Permission guard system operational across all endpoints
- [ ] Auth-related ledger events captured (login, logout, permission denied)
- [ ] Rate limiting active on all public endpoints
- [ ] Integration tests validate auth flows and permission enforcement

---

## Daily Task Breakdown

### Backend Authentication Module

#### Auth Module Setup
- [ ] Generate `auth` module using NestJS CLI (`nest g module auth`)
- [ ] Generate `auth` controller (`nest g controller auth`)
- [ ] Generate `auth` service (`nest g service auth`)
- [ ] Install dependencies: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `passport-local`
- [ ] Install types: `@types/passport-jwt`, `@types/passport-local`

#### JWT Authentication Strategy
- [ ] Create `JwtStrategy` class extending `PassportStrategy`
- [ ] Configure JWT secret from environment variables
- [ ] Implement JWT payload validation
- [ ] Extract user/actor information from JWT
- [ ] Add tenant_id to JWT payload
- [ ] Create `JwtAuthGuard` extending `AuthGuard('jwt')`
- [ ] Test JWT strategy with valid tokens
- [ ] Test JWT strategy with expired tokens
- [ ] Test JWT strategy with invalid signatures

#### Service Token Strategy
- [ ] Create `ServiceTokenStrategy` class
- [ ] Implement service token validation from database
- [ ] Add service token to database schema (service_tokens table)
- [ ] Create ServiceToken entity with TypeORM
- [ ] Add token hashing (bcrypt or SHA-256)
- [ ] Implement token revocation check
- [ ] Create `ServiceAuthGuard` extending `AuthGuard('service')`
- [ ] Test service token authentication
- [ ] Test revoked token rejection

#### Auth Controller Endpoints
- [ ] `POST /api/v1/auth/login` - User login endpoint
  - [ ] Validate credentials (username/password)
  - [ ] Generate JWT token
  - [ ] Create LOGIN_SUCCESS ledger event
  - [ ] Return token and user info
  - [ ] Handle login failures with LOGIN_FAILED event
- [ ] `POST /api/v1/auth/logout` - User logout endpoint
  - [ ] Validate JWT token
  - [ ] Create LOGOUT ledger event
  - [ ] Invalidate token (add to blacklist in Redis)
- [ ] `POST /api/v1/auth/refresh` - Token refresh endpoint
  - [ ] Validate refresh token
  - [ ] Generate new access token
  - [ ] Create TOKEN_REFRESHED event
- [ ] `POST /api/v1/auth/service-token` - Generate service token
  - [ ] Admin-only endpoint
  - [ ] Create service token with scoped permissions
  - [ ] Store hashed token in database
  - [ ] Create SERVICE_TOKEN_CREATED event
- [ ] `DELETE /api/v1/auth/service-token/:id` - Revoke service token
  - [ ] Admin-only endpoint
  - [ ] Mark token as revoked
  - [ ] Create SERVICE_TOKEN_REVOKED event

#### Permissions Guard System
- [ ] Create `PermissionsGuard` implementing `CanActivate`
- [ ] Create `@RequirePermissions()` decorator
- [ ] Implement permission check logic
  - [ ] Extract actor permissions from request
  - [ ] Compare with required permissions
  - [ ] Allow if actor has all required permissions
- [ ] Create PERMISSION_DENIED ledger event on failure
- [ ] Add tenant isolation check
- [ ] Test permissions guard with various permission sets
- [ ] Test multi-permission requirements
- [ ] Test tenant isolation enforcement

#### Rate Limiting
- [ ] Install `@nestjs/throttler` package
- [ ] Configure ThrottlerModule with Redis storage
- [ ] Apply global rate limiting (100 requests/minute default)
- [ ] Add stricter limits to auth endpoints (5 login attempts/minute)
- [ ] Create RATE_LIMIT_EXCEEDED ledger event
- [ ] Test rate limiting enforcement
- [ ] Test rate limit reset after time window

#### Auth Ledger Events
- [ ] Create auth event types in ledger-contracts
  - [ ] LOGIN_SUCCESS
  - [ ] LOGIN_FAILED
  - [ ] LOGOUT
  - [ ] TOKEN_REFRESHED
  - [ ] SERVICE_TOKEN_CREATED
  - [ ] SERVICE_TOKEN_REVOKED
  - [ ] PERMISSION_DENIED
  - [ ] RATE_LIMIT_EXCEEDED
- [ ] Integrate auth events with LedgerEventsService
- [ ] Capture complete metadata (actor, IP, user agent, result)
- [ ] Test auth event creation for each scenario

#### Tenant Isolation
- [ ] Add tenant_id extraction from JWT
- [ ] Create `@Tenant()` decorator for request context
- [ ] Modify all database queries to filter by tenant_id
- [ ] Add tenant validation to auth guards
- [ ] Test cross-tenant access prevention
- [ ] Create TENANT_ISOLATION_VIOLATION event for violations

#### Unit Tests (Target: 100% Coverage)
- [ ] Auth service tests
  - [ ] Test login with valid credentials
  - [ ] Test login with invalid credentials
  - [ ] Test token generation
  - [ ] Test token validation
  - [ ] Test service token creation
  - [ ] Test service token validation
- [ ] JWT strategy tests
  - [ ] Test valid JWT validation
  - [ ] Test expired JWT rejection
  - [ ] Test invalid signature rejection
  - [ ] Test tenant extraction
- [ ] Permissions guard tests
  - [ ] Test permission grant
  - [ ] Test permission denial
  - [ ] Test multiple permission requirements
  - [ ] Test tenant isolation
- [ ] Rate limiting tests
  - [ ] Test rate limit enforcement
  - [ ] Test rate limit reset
  - [ ] Test different limits per endpoint

#### Integration Tests
- [ ] Login flow integration test
  - [ ] POST /auth/login with valid credentials returns JWT
  - [ ] POST /auth/login with invalid credentials returns 401
  - [ ] LOGIN_SUCCESS event created on success
  - [ ] LOGIN_FAILED event created on failure
- [ ] Protected endpoint integration test
  - [ ] Request with valid JWT succeeds
  - [ ] Request without JWT returns 401
  - [ ] Request with expired JWT returns 401
  - [ ] Request with invalid JWT returns 401
- [ ] Permissions integration test
  - [ ] Request with required permissions succeeds
  - [ ] Request without required permissions returns 403
  - [ ] PERMISSION_DENIED event created on denial
- [ ] Service token integration test
  - [ ] Create service token as admin
  - [ ] Authenticate with service token
  - [ ] Revoked service token rejected
- [ ] Rate limiting integration test
  - [ ] Exceed rate limit returns 429
  - [ ] Rate limit resets after time window
  - [ ] RATE_LIMIT_EXCEEDED event created

#### OpenAPI Documentation
- [ ] Add Swagger decorators to auth controller
- [ ] Document request/response schemas
- [ ] Add authentication examples
- [ ] Document error responses
- [ ] Add security scheme definitions

---

### Contract Library Updates

#### Auth Contracts Extension
- [ ] Create JWT payload schema (user_id, actor_type, tenant_id, permissions, exp, iat)
- [ ] Add login request schema (username, password)
- [ ] Add login response schema (access_token, refresh_token, user_info)
- [ ] Create service token schema (name, permissions, scopes)
- [ ] Add permission enum values (LEDGER_READ, LEDGER_WRITE, ADMIN, etc.)
- [ ] Create actor type enum (USER, SERVICE, DEVICE, SYSTEM)
- [ ] Add validation for permission combinations
- [ ] Export all schemas from auth-contracts index

#### Shared Models Updates
- [ ] Add User type definition
- [ ] Add ServiceToken type definition
- [ ] Create auth error types
- [ ] Add rate limit error schema

---

### Frontend Authentication

#### Auth Service
- [ ] Create `auth.service.ts` in ledger-web
- [ ] Implement login method
  - [ ] POST to /api/v1/auth/login
  - [ ] Store JWT in localStorage (or sessionStorage)
  - [ ] Store user info in memory
  - [ ] Emit authentication state change
- [ ] Implement logout method
  - [ ] POST to /api/v1/auth/logout
  - [ ] Clear stored tokens
  - [ ] Clear user info
  - [ ] Navigate to login page
- [ ] Implement token refresh logic
  - [ ] Auto-refresh before expiration
  - [ ] Handle refresh failures
- [ ] Create auth state observable (logged in/out)
- [ ] Add getCurrentUser() method
- [ ] Add hasPermission() method for UI conditional rendering

#### Login Page Component
- [ ] Create login.page.ts component
- [ ] Build login form with reactive forms
  - [ ] Username field with validation
  - [ ] Password field with validation
  - [ ] Remember me checkbox (optional)
  - [ ] Login button
- [ ] Display login errors (invalid credentials, network errors)
- [ ] Show loading state during login
- [ ] Redirect to dashboard after successful login
- [ ] Add forgot password link (placeholder for PI-2)

#### HTTP Interceptor
- [ ] Create auth.interceptor.ts
- [ ] Add Authorization header with JWT to all requests
- [ ] Handle 401 responses (redirect to login)
- [ ] Handle 403 responses (show permission error)
- [ ] Handle token refresh on 401
- [ ] Exclude login endpoint from auth header

#### Auth Guard
- [ ] Create auth.guard.ts implementing CanActivate
- [ ] Check authentication state
- [ ] Redirect to login if not authenticated
- [ ] Store intended URL for post-login redirect
- [ ] Check route-specific permissions (optional)

#### Auth State Management
- [ ] Create auth state using Angular signals or RxJS
- [ ] Track logged in/out status
- [ ] Track current user info
- [ ] Track user permissions
- [ ] Expose isAuthenticated$ observable
- [ ] Expose currentUser$ observable

#### UI Integration
- [ ] Add login/logout button to app header
- [ ] Display current user name when logged in
- [ ] Show user avatar or initials
- [ ] Add protected route guards to all secure routes
- [ ] Update navigation to show/hide items based on permissions

#### Unit Tests
- [ ] Auth service tests
  - [ ] Test login success
  - [ ] Test login failure
  - [ ] Test logout
  - [ ] Test token storage
  - [ ] Test token refresh
  - [ ] Test permission checks
- [ ] Auth guard tests
  - [ ] Test authenticated user allowed
  - [ ] Test unauthenticated user redirected
  - [ ] Test intended URL stored
- [ ] Auth interceptor tests
  - [ ] Test auth header added
  - [ ] Test 401 handling
  - [ ] Test 403 handling

---

### E2E Testing (Playwright)

#### Login Flow E2E Tests
- [ ] Test successful login flow
  - [ ] Navigate to login page
  - [ ] Enter valid credentials
  - [ ] Click login button
  - [ ] Verify redirect to dashboard
  - [ ] Verify auth token stored
  - [ ] Verify user info displayed
- [ ] Test failed login flow
  - [ ] Enter invalid credentials
  - [ ] Verify error message displayed
  - [ ] Verify no redirect
  - [ ] Verify no token stored
- [ ] Test logout flow
  - [ ] Login first
  - [ ] Click logout button
  - [ ] Verify redirect to login
  - [ ] Verify token cleared
  - [ ] Verify user info cleared

#### Protected Route E2E Tests
- [ ] Test unauthenticated access redirects to login
  - [ ] Navigate to /dashboard without login
  - [ ] Verify redirect to /login
  - [ ] Verify intended URL stored
- [ ] Test authenticated access allowed
  - [ ] Login successfully
  - [ ] Navigate to /dashboard
  - [ ] Verify dashboard content displayed
- [ ] Test post-login redirect to intended URL
  - [ ] Try to access /orders without auth
  - [ ] Login successfully
  - [ ] Verify redirect to /orders

#### Permission-Based Access E2E Tests
- [ ] Test user with permissions can access route
  - [ ] Login as admin user
  - [ ] Navigate to admin-only page
  - [ ] Verify page content displayed
- [ ] Test user without permissions sees error
  - [ ] Login as regular user
  - [ ] Try to navigate to admin page
  - [ ] Verify permission error displayed
  - [ ] Verify no sensitive data exposed

#### Auth Audit Trail E2E Tests
- [ ] Test login creates audit event
  - [ ] Login successfully
  - [ ] Navigate to ledger events page
  - [ ] Verify LOGIN_SUCCESS event visible
  - [ ] Verify event metadata complete
- [ ] Test failed login creates audit event
  - [ ] Attempt login with bad credentials
  - [ ] Navigate to ledger events page (as admin)
  - [ ] Verify LOGIN_FAILED event visible
- [ ] Test permission denial creates audit event
  - [ ] Login as regular user
  - [ ] Try to access admin endpoint
  - [ ] Check ledger for PERMISSION_DENIED event

---

### Documentation

#### Technical Documentation
- [ ] Document authentication architecture in `documentation/platform/security-model.md`
- [ ] Add JWT token structure reference
- [ ] Document permission model and available permissions
- [ ] Create auth endpoint API reference
- [ ] Document service token creation and management
- [ ] Add rate limiting configuration guide

#### Integration Guides
- [ ] Create "Getting Started with Authentication" guide
- [ ] Document login flow for frontend developers
- [ ] Create service token integration guide for partners
- [ ] Add auth troubleshooting guide
- [ ] Document permission configuration

#### README Updates
- [ ] Add authentication setup instructions
- [ ] Document environment variables for auth
- [ ] Add auth testing instructions
- [ ] Update quick start guide with login step

---

## Definition of Done

A task is considered complete when:
- [ ] Code written and follows coding standards
- [ ] Unit tests written and passing (90%+ coverage for new code)
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing (where applicable)
- [ ] Code reviewed and approved
- [ ] OpenAPI documentation updated
- [ ] Technical documentation updated
- [ ] No critical or high severity bugs
- [ ] Deployed to development environment and tested
- [ ] Demo-ready for sprint review

---

## Sprint Risks

### High Priority Risks
- **JWT Secret Management:** Ensure JWT secrets are never committed to git (mitigation: use .env files, validate in CI)
- **Token Storage Security:** XSS attacks could steal tokens from localStorage (mitigation: consider httpOnly cookies, add CSP headers)
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
