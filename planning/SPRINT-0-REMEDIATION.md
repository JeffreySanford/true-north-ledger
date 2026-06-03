# Sprint 0: Critical Security & Quality Remediation

**Status:** BLOCKING - Must complete before Sprint 1  
**Duration:** 1 week (estimated)  
**Priority:** CRITICAL

---

## Executive Summary

A comprehensive security and quality audit revealed **critical gaps** between documentation claims and actual implementation. The current codebase is **NOT** production-ready or "foundation complete." This sprint addresses blocking security issues and quality gates before proceeding with planned PI-1 work.

**Critical Finding:** The ledger API is publicly writable with no authentication, no tenant isolation, and no real audit chain. This directly conflicts with the security model and auditability goals.

---

## Critical Issues (BLOCKING)

### 1. Ledger API is Publicly Writable 🚨

**Finding:**
- `POST /api/v1/ledger/events` has NO authentication guard
- No permission validation
- No tenant isolation
- No rate limiting
- No actor validation beyond string schema
- **Impact:** Anyone can write arbitrary audit events

**Location:** [ledger-events.controller.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.controller.ts#L20)

**Required Fix:**
- [ ] Add `@UseGuards(AuthGuard)` to all endpoints
- [ ] Implement JWT authentication strategy
- [ ] Add permission guard for write operations
- [ ] Add tenant isolation guard
- [ ] Implement rate limiting (per-tenant, per-actor)
- [ ] Extract actor from authenticated request, not client payload

**References:**
- [security-model.md](../documentation/platform/security-model.md#L52) - Required controls
- Sprint 1 tasks should implement this, but it's blocking

---

### 2. Audit Chain Not Implemented 🚨

**Finding:**
- No `event_hash` column in database
- No `previous_hash` tracking
- Client supplies payload hash (should be server-computed)
- No transaction isolation for chain append
- No append-only enforcement
- Hash verification only checks client-supplied value

**Location:** 
- [ledger-event.entity.ts](../apps/ledger-api/src/app/ledger-events/ledger-event.entity.ts#L104)
- [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L51)

**Required Fix:**
- [ ] Add `event_hash` column (sha256 of canonical event data)
- [ ] Add `previous_hash` column (hash of previous event in chain)
- [ ] Add `chain_sequence` column (monotonic sequence per tenant)
- [ ] Implement canonical payload normalization
- [ ] Server computes all hashes (tenant + actor + subject + payload + previous + timestamp + result)
- [ ] Wrap append in transaction with row-level locks
- [ ] Add database constraint: `CHECK (previous_hash IS NULL OR chain_sequence > 1)`
- [ ] Add unique constraint on (tenant_id, chain_sequence)

**Migration Required:** Yes - database schema change

---

### 3. Client Controls Audit Metadata 🚨

**Finding:**
- Frontend supplies: `tenantId`, `actorId`, `actorType`, `userAgent`, `timestamp`, `result`, `payloadHash`
- For audit system, server MUST control this metadata
- Client should only supply: `eventType`, `subjectType`, `subjectId`, `payload`

**Location:** [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L38)

**Required Fix:**
- [ ] Extract `tenantId` from authenticated user's token
- [ ] Extract `actorId` and `actorType` from authenticated request
- [ ] Capture `userAgent` from request headers (server-side)
- [ ] Set `timestamp` using server clock (UTC)
- [ ] Set `result` based on operation outcome
- [ ] Compute `payloadHash` server-side
- [ ] Reject client-supplied audit metadata
- [ ] Update contract schemas to only accept business data

---

### 4. Contract Schemas Too Permissive 🚨

**Finding:**
- `DEVICE_LEDGER_EVENT` accepts missing `deviceId` and `deviceType`
- Service writes empty strings instead of rejecting
- Integration test fails: expects 400, gets 201

**Location:** 
- [ledger-contracts.ts](../libs/ledger-contracts/src/lib/ledger-contracts.ts#L68)
- [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L78)

**Required Fix:**
- [ ] Make `deviceId` and `deviceType` required for device events
- [ ] Add discriminated union based on `actorType`
- [ ] Validate actor-specific metadata matches actor type
- [ ] Return 400 Bad Request for invalid/missing required fields
- [ ] Fix failing test: "should reject DEVICE_LEDGER_EVENT without deviceId"

---

## High Priority Issues

### 5. Tests Currently Do Not Pass ⚠️

**Finding:**
```bash
pnpm nx run-many -t lint test build
# Result:
# - lint: FAILED (all projects)
# - ledger-api:test: FAILED (1 of 43 tests)
# - ledger-web:test: PASSED
# - build: PASSED (with bundle warnings)
# - e2e: TIMEOUT (not passing)
```

**Required Fix:**
- [ ] Fix lint configuration (broken imports)
- [ ] Fix failing test: deviceId validation
- [ ] Fix E2E startup on Windows (bash -lc issue)
- [ ] Ensure all tests pass before proceeding

---

### 6. Error Handling Returns 500s ⚠️

**Finding:**
- Invalid UUIDs → 500
- Missing events → 500
- Payload hash mismatches → 500
- Should return: 400 (bad request), 404 (not found), 422 (validation)

**Location:** [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L36)

**Required Fix:**
- [ ] Catch validation errors → 400 Bad Request
- [ ] Catch not found errors → 404 Not Found
- [ ] Catch business rule violations → 422 Unprocessable Entity
- [ ] Catch integrity violations → 409 Conflict
- [ ] Only log/return 500 for unexpected errors
- [ ] Add proper error response DTOs

---

### 7. Lint Configuration Broken ⚠️

**Finding:**
- Library and API configs import `../eslint.config.mjs`
- These files do not exist (circular reference)
- Breaks all lint commands

**Location:** 
- [libs/ledger-contracts/eslint.config.mjs](../libs/ledger-contracts/eslint.config.mjs#L1)
- Similar in all libs and apps

**Required Fix:**
- [ ] Fix ESLint config inheritance
- [ ] Reference root `eslint.config.mjs` correctly
- [ ] Ensure `pnpm nx run-many -t lint` passes
- [ ] Add lint to CI/CD pipeline

---

### 8. Documentation Overstates Maturity ⚠️

**Finding:**
- README claims "Foundation Phase Complete"
- Claims "100% coverage"
- Reality: no auth, no chain, tests failing, lint broken

**Required Fix:**
- [x] Update README to reflect actual state
- [ ] Update CURRENT-STATE.md with honest assessment
- [ ] Remove "100% coverage" claims
- [ ] Add "Known Issues" section
- [ ] Document remediation plan

---

## Medium Priority Issues

### 9. Dependency Audit Findings

**Finding:**
- 2 moderate vulnerabilities in transitive dependencies
- `ws` and `uuid` paths through Nx/dev tooling

**Required Fix:**
- [ ] Run `pnpm audit --fix`
- [ ] Update vulnerable dependencies
- [ ] Document any unfixable dev-only issues
- [ ] Add audit check to CI/CD

---

### 10. E2E Could Not Complete

**Finding:**
- `pnpm nx e2e ledger-web-e2e` timed out after 5 minutes
- `pnpm start:full` uses `bash -lc` which is fragile on Windows

**Required Fix:**
- [ ] Replace `bash -lc` with cross-platform solution
- [ ] Use `concurrently` package or Nx task orchestration
- [ ] Add timeout configuration
- [ ] Ensure E2E can run on Windows
- [ ] Add E2E to CI/CD pipeline

---

## Remediation Checklist

### Phase 1: Fix Quality Gates (Days 1-2)
- [ ] Fix lint configuration across all projects
- [ ] Fix failing ledger-api test (deviceId validation)
- [ ] Fix E2E startup script (Windows compatibility)
- [ ] Run `pnpm audit --fix`
- [ ] Verify all tests pass
- [ ] Verify all lints pass
- [ ] Verify builds complete

### Phase 2: Implement Server-Side Audit Control (Days 3-4)
- [ ] Update contract schemas (client supplies only business data)
- [ ] Implement request context extraction (tenant, actor from auth)
- [ ] Move metadata generation server-side (timestamp, userAgent, hashes)
- [ ] Add canonical payload normalization
- [ ] Update tests for new contracts
- [ ] Update frontend to send only business data

### Phase 3: Implement Audit Chain (Days 4-5)
- [ ] Create database migration for chain columns
  - `event_hash` (VARCHAR 64)
  - `previous_hash` (VARCHAR 64, nullable)
  - `chain_sequence` (BIGINT)
  - Unique constraint on (tenant_id, chain_sequence)
- [ ] Implement hash computation (canonical format)
- [ ] Implement previous hash lookup with transaction
- [ ] Add append-only constraint enforcement
- [ ] Add chain integrity verification endpoint
- [ ] Add tests for chain integrity

### Phase 4: Add Authentication & Guards (Days 5-7)
- [ ] Implement JWT authentication strategy (basic)
- [ ] Add `@UseGuards(AuthGuard)` to ledger endpoints
- [ ] Implement tenant isolation guard
- [ ] Implement permission guard (write vs read)
- [ ] Add rate limiting middleware
- [ ] Add tests for auth denial, tenant isolation
- [ ] Add tests for permission validation

### Phase 5: Improve Error Handling & Coverage (Day 7)
- [ ] Refactor error handling (proper HTTP codes)
- [ ] Add error response DTOs
- [ ] Add behavior tests:
  - Auth denial (401)
  - Permission denial (403)
  - Tenant isolation violation (403)
  - Hash chain integrity validation
  - Append-only enforcement
  - Rate limit enforcement
- [ ] Replace "100% coverage" goal with behavior coverage

---

## Definition of Done

Sprint 0 is complete when:
- [ ] All tests pass (`pnpm nx run-many -t test`)
- [ ] All lints pass (`pnpm nx run-many -t lint`)
- [ ] All builds succeed (`pnpm nx run-many -t build`)
- [ ] E2E tests complete (`pnpm nx e2e ledger-web-e2e`)
- [ ] Ledger API requires authentication
- [ ] Audit metadata is server-controlled
- [ ] Audit chain is implemented (event_hash, previous_hash)
- [ ] Tenant isolation is enforced
- [ ] Error handling returns proper HTTP codes
- [ ] No critical or high security issues remain
- [ ] Documentation reflects actual state
- [ ] Dependency audit shows no moderate+ issues

---

## Impact on Sprint 1

**Sprint 1 Start Date:** BLOCKED until Sprint 0 complete

Sprint 1 (Authentication & Authorization) assumes these foundations are in place:
- Working test/lint/build pipeline ✅ (after Sprint 0)
- Server-controlled audit metadata ✅ (after Sprint 0)
- Basic auth infrastructure ✅ (after Sprint 0)
- Ledger chain integrity ✅ (after Sprint 0)

Sprint 1 will then BUILD ON this foundation to add:
- Multi-tenant user registration
- Role-based permissions
- Service token authentication
- Device token authentication
- Permission middleware
- Auth UI components

---

## Success Metrics

- [ ] Zero failing tests
- [ ] Zero lint errors
- [ ] Zero critical/high security issues
- [ ] Ledger API requires valid JWT
- [ ] Audit events have cryptographic chain
- [ ] Audit metadata cannot be spoofed by client
- [ ] Error responses use correct HTTP codes
- [ ] E2E suite completes in <3 minutes

---

## Lessons Learned

1. **Do not claim coverage without verification** - Tests were failing
2. **Security must be built in, not bolted on** - Auth should have been first
3. **Audit systems must be server-controlled** - Client cannot be trusted
4. **Lint/test gates must pass before new features** - Quality baseline
5. **Documentation must match reality** - Honesty builds trust

---

## Next Steps After Remediation

Once Sprint 0 is complete, proceed with:
1. **Sprint 1:** Build out full authentication system (users, services, devices)
2. **Sprint 2:** Add device management with proper identity
3. **Sprint 3:** Add orders module leveraging auth foundation
4. **Sprint 4:** Add inventory with device integration
5. **Sprint 5:** Add WebSockets and production infrastructure

The planned direction is correct - the implementation just needs to match the design.
