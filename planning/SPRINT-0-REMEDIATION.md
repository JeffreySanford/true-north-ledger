# Sprint 0: Critical Security & Quality Remediation

**Status:** COMPLETE - Sprint 1 product auth/UI work remains  
**Duration:** 1 week (estimated)  
**Priority:** CRITICAL

---

## Progress Update (2026-06-03)

### Completed:
- ✅ **Phase 1 Complete**: Quality gates are passing
  - Lint configuration fixed across all 8 projects
  - Failing device event validation fixed
  - E2E startup made cross-platform and stable on Windows
  - Contract schemas tightened (discriminated unions)
- ✅ **Phase 2 Complete for Sprint 0**: Server-side audit metadata control implemented
  - Client append DTOs accept only business data
  - Server derives tenant, actor, timestamps, request/correlation IDs, source IP, user agent, result, payload hash, event hash, and chain sequence
  - Client-supplied audit metadata and actor spoofing are rejected by strict schemas
  - Frontend sends business-only append payloads and includes auth headers
- ✅ **Phase 3 Complete**: Audit chain implemented and database hardening added
  - `event_hash`, `previous_hash`, and `chain_sequence` added to entity/contracts
  - Canonical payload hashing and event hashing implemented
  - Appends run in a transaction and link to the prior tenant event
  - Migration adds chain backfill, uniqueness/check constraints, append-only trigger, and chain verification endpoint
  - Chain behavior and verification covered by service/integration tests
- ✅ **Phase 4 Complete for Sprint 0**: Authentication and authorization infrastructure added
  - JWT strategy with passport implemented
  - Auth guards created (JWT + tenant isolation + permissions)
  - Guards applied to ledger endpoints
  - Service extracts tenant/actor from auth context
  - Read/write permission checks covered by tests
- ✅ **Phase 5 Complete**: Error handling and behavior coverage improved
  - Invalid IDs return 400
  - Missing events return 404
  - Invalid append payloads return 400
  - Formal error DTO/filter added
  - Auth denial, permission denial, tenant isolation, strict DTO rejection, chain linkage, rate limit, and performance smoke tests added

### Remaining After Sprint 0:
- ⏳ Add a real login/session flow in Sprint 1; no committed frontend token fallback remains
- ⏳ Continue reducing lint/build warnings during normal feature work

---

## Executive Summary

A comprehensive security and quality audit revealed **critical gaps** between documentation claims and actual implementation. The current codebase is **NOT** production-ready or "foundation complete." This sprint addresses blocking security issues and quality gates before proceeding with planned PI-1 work.

**Original Critical Finding:** The ledger API was publicly writable with no authentication, no tenant isolation, and no real audit chain. Sprint 0 remediation now closes the immediate API exposure, spoofing, audit chain, rate-limit, and quality-gate gaps.

---

## Critical Issues (BLOCKING)

### 1. Ledger API Was Publicly Writable 🚨

**Original finding:**
- `POST /api/v1/ledger/events` has NO authentication guard
- No permission validation
- No tenant isolation
- No rate limiting
- No actor validation beyond string schema
- **Impact:** Anyone can write arbitrary audit events

**Location:** [ledger-events.controller.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.controller.ts#L20)

**Required Fix:**
- [X] Add `@UseGuards(AuthGuard)` to all endpoints
- [X] Implement JWT authentication strategy
- [X] Add permission guard for write operations
- [X] Add tenant isolation guard
- [X] Implement rate limiting (per-tenant, per-actor)
- [X] Extract actor from authenticated request, not client payload

**References:**
- [security-model.md](../documentation/platform/security-model.md#L52) - Required controls
- Sprint 1 tasks should implement this, but it's blocking

---

### 2. Audit Chain Was Not Implemented 🚨

**Original finding:**
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
- [X] Add `event_hash` column (sha256 of canonical event data)
- [X] Add `previous_hash` column (hash of previous event in chain)
- [X] Add `chain_sequence` column (monotonic sequence per tenant)
- [X] Implement canonical payload normalization
- [X] Server computes payload hash and full event hash
- [X] Wrap append in transaction
- [X] Add database constraint: `CHECK (previous_hash IS NULL OR chain_sequence > 1)`
- [X] Add unique constraint on (tenant_id, chain_sequence)

**Migration Required:** Yes - database schema change

---

### 3. Client Controlled Audit Metadata 🚨

**Original finding:**
- Frontend supplies: `tenantId`, `actorId`, `actorType`, `userAgent`, `timestamp`, `result`, `payloadHash`
- For audit system, server MUST control this metadata
- Client should only supply: `eventType`, `subjectType`, `subjectId`, `payload`

**Location:** [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L38)

**Required Fix:**
- [X] Extract `tenantId` from authenticated user's token
- [X] Extract `actorId` and `actorType` from authenticated request
- [X] Capture `userAgent` from request headers (server-side)
- [X] Set `timestamp` using server clock (UTC)
- [X] Set `result` based on operation outcome
- [X] Compute `payloadHash` server-side
- [X] Reject client-supplied audit metadata
- [X] Update contract schemas to only accept business data

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
- [X] Make `deviceId` and `deviceType` required for device events
- [X] Add discriminated union based on `actorType`
- [X] Validate actor-specific metadata matches actor type
- [X] Return 400 Bad Request for invalid/missing required fields
- [X] Fix failing test: "should reject DEVICE_LEDGER_EVENT without deviceId"

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
- [X] Fix lint configuration (broken imports)
- [X] Fix failing test: deviceId validation
- [X] Fix E2E startup on Windows (bash -lc issue)
- [X] Ensure all tests pass before proceeding

---

### 6. Error Handling Returns 500s ⚠️

**Finding:**
- Invalid UUIDs → 500
- Missing events → 500
- Payload hash mismatches → 500
- Should return: 400 (bad request), 404 (not found), 422 (validation)

**Location:** [ledger-events.service.ts](../apps/ledger-api/src/app/ledger-events/ledger-events.service.ts#L36)

**Required Fix:**
- [X] Catch validation errors → 400 Bad Request
- [X] Catch not found errors → 404 Not Found
- [X] Catch handled business validation violations → 422 Unprocessable Entity
- [X] Catch integrity violations → 409 Conflict
- [X] Only log/return 500 for unexpected errors
- [X] Add proper error response DTOs

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
- [X] Fix ESLint config inheritance
- [X] Reference root `eslint.config.mjs` correctly
- [X] Ensure `pnpm nx run-many -t lint` passes
- [X] Add lint to CI/CD pipeline

---

### 8. Documentation Overstated Maturity ⚠️

**Original finding:**
- README claims "Foundation Phase Complete"
- Claims "100% coverage"
- Reality at audit time: no auth, no chain, tests failing, lint broken

**Required Fix:**
- [X] Update README to reflect actual state
- [X] Update CURRENT-STATE.md with honest assessment
- [X] Remove/update unsupported "100% coverage" claims in current-state docs
- [X] Add "Known Issues" / remaining hardening section
- [X] Document remediation plan

---

## Medium Priority Issues

### 9. Dependency Audit Findings

**Finding:**
- 2 moderate vulnerabilities in transitive dependencies
- `ws` and `uuid` paths through Nx/dev tooling

**Required Fix:**
- [X] Run `pnpm audit --fix`
- [X] Update vulnerable dependencies via overrides
- [X] Document residual status: no known moderate+ vulnerabilities after audit
- [X] Add audit check to CI/CD

---

### 10. E2E Could Not Complete

**Finding:**
- `pnpm nx e2e ledger-web-e2e` timed out after 5 minutes
- `pnpm start:full` uses `bash -lc` which is fragile on Windows

**Required Fix:**
- [X] Replace `bash -lc` with cross-platform solution
- [X] Use `concurrently` package or Nx task orchestration
- [X] Add stable worker configuration
- [X] Ensure E2E can run on Windows
- [X] Add E2E to CI/CD pipeline

---

## Remediation Checklist

### Phase 1: Fix Quality Gates (Days 1-2) ✅ COMPLETE
- [X] Fix lint configuration across all projects
- [X] Fix failing ledger-api test (deviceId validation)
- [X] Fix E2E startup script (Windows compatibility)
- [X] Run `pnpm audit --fix`
- [X] Verify all lints pass
- [X] Verify builds complete
- [X] Verify all tests pass

### Phase 2: Implement Server-Side Audit Control (Days 3-4) ✅ COMPLETE
- [X] Update contract schemas (client supplies only business data)
- [X] Implement request context extraction (tenant, actor from auth)
- [X] Move metadata generation server-side (timestamp, requestId, hashes)
- [X] Extract sourceIp and userAgent from request headers
- [X] Add canonical payload normalization
- [X] Update tests for new contracts
- [X] Update frontend to send only business data

### Phase 3: Implement Audit Chain (Days 4-5) ✅ COMPLETE
- [X] Create database migration for chain columns
  - `event_hash` (VARCHAR 64)
  - `previous_hash` (VARCHAR 64, nullable)
  - `chain_sequence` (BIGINT)
  - Unique constraint on (tenant_id, chain_sequence)
- [X] Implement hash computation (canonical format)
- [X] Implement previous hash lookup with transaction
- [X] Add append-only constraint enforcement
- [X] Add chain integrity verification endpoint
- [X] Add tests for chain linkage/integrity inputs

### Phase 4: Add Authentication & Guards (Days 5-7) ✅ COMPLETE
- [X] Implement JWT authentication strategy (basic)
- [X] Add `@UseGuards(AuthGuard)` to ledger endpoints
- [X] Implement tenant isolation guard
- [X] Implement permission guard (write vs read)
- [X] Add rate limiting middleware
- [X] Add tests for auth denial, tenant isolation
- [X] Add tests for permission validation
- [X] Update existing tests to mock authentication

### Phase 5: Improve Error Handling & Coverage (Day 7) ✅ COMPLETE
- [X] Refactor core ledger error handling (proper HTTP codes)
- [X] Add error response DTOs
- [X] Add behavior tests:
  - Auth denial (401) ✅
  - Permission denial (403) ✅
  - Tenant isolation violation (403) ✅
  - Hash chain linkage validation ✅
  - Chain verification ✅
  - Rate limit enforcement ✅
- [X] Replace "100% coverage" goal with behavior coverage

---

## Definition of Done

Sprint 0 is complete when:
- [X] All tests pass (`pnpm nx run-many -t test`)
- [X] All lints pass (`pnpm nx run-many -t lint`)
- [X] All builds succeed (`pnpm nx run-many -t build`)
- [X] E2E tests complete (`pnpm nx e2e ledger-web-e2e`)
- [X] Ledger API requires authentication
- [X] Audit metadata is server-controlled
- [X] Audit chain is implemented in code (event_hash, previous_hash, chain_sequence)
- [X] Tenant isolation is enforced
- [X] Core ledger error handling returns proper HTTP codes
- [X] No critical or high security issues remain
- [X] Documentation reflects actual state
- [X] Dependency audit shows no moderate+ issues

---

## Impact on Sprint 1

**Sprint 1 Start Date:** UNBLOCKED

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

- [X] Zero failing tests
- [X] Zero lint errors
- [X] Zero critical/high security issues identified by dependency audit
- [X] Ledger API requires valid JWT
- [X] Audit events have cryptographic chain fields and hashes
- [X] Audit metadata cannot be spoofed by client DTOs
- [X] Core ledger error responses use correct HTTP codes
- [X] E2E suite completes in <3 minutes

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
