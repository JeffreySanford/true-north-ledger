# Program Increment 1 - Core Platform Foundation

**Duration:** 10 weeks (5 x 2-week sprints)  
**Start Date:** 2026-06-03  
**End Date:** 2026-08-11  
**Focus:** Authentication, Device Management, Orders & Inventory Core

## PI Objectives

Build the foundational platform capabilities that enable secure multi-actor operations (users, services, devices, system) with full auditability and proof generation.

### PI-Level Acceptance Criteria

- [ ] All actor types (`user`, `service`, `device`, `system`) can authenticate and receive scoped permissions
- [ ] RBAC roles govern API permissions and web/tablet/mobile route visibility
- [ ] Devices can register, authenticate, and submit events with proper identity
- [ ] Orders can be created, updated, and tracked with full ledger audit trail
- [ ] Inventory operations create verifiable ledger events
- [ ] All write operations generate ledger events with proper hash chaining
- [ ] WebSocket notifications deliver real-time updates to connected clients
- [ ] Public proof pages verify events without exposing private data
- [ ] E2E tests validate critical workflows across frontend and API
- [ ] Production-ready Docker Compose infrastructure deployed with monitoring
- [ ] API documentation (OpenAPI/Swagger) published and accessible

### PI Success Metrics

- 90%+ test coverage across all modules
- < 200ms p95 API response time for read operations
- < 500ms p95 API response time for write operations
- Zero critical security vulnerabilities
- All ledger events include complete audit metadata
- 100% of write operations create auditable ledger events

---

## Sprint 1: Authentication & Authorization Foundation (Weeks 1-2)

**Goal:** Implement secure multi-actor authentication with scoped permissions and audit events.

### Sprint Acceptance Criteria

- [ ] JWT-based authentication working for `user` actors
- [ ] Service token authentication implemented
- [ ] Permission guard system operational across all endpoints
- [ ] Auth-related ledger events captured (login, logout, permission denied)
- [ ] Rate limiting active on all public endpoints
- [ ] Integration tests validate auth flows and permission enforcement

### Tasks

#### Backend Authentication
- [ ] Create `auth` module in ledger-api
- [ ] Implement JWT strategy with NestJS Passport
- [ ] Create `AuthController` with login/logout endpoints
- [ ] Build `JwtAuthGuard` for protected routes
- [ ] Create `PermissionsGuard` using actor type and permission scopes
- [ ] Add service token validation strategy
- [ ] Implement rate limiting middleware (Redis-backed)
- [ ] Create auth-related ledger event types (LOGIN_SUCCESS, LOGIN_FAILED, PERMISSION_DENIED)
- [ ] Add tenant isolation to all database queries
- [ ] Write behavior-focused unit tests for auth service
- [ ] Write integration tests for auth endpoints
- [ ] Add OpenAPI decorators to auth endpoints

#### Contract Updates
- [ ] Extend auth-contracts with JWT payload schema
- [ ] Add service token schema validation
- [ ] Create permission decorator schemas
- [ ] Add auth request/response Zod schemas

#### Frontend Integration
- [ ] Create `AuthService` in ledger-web
- [ ] Build login page component
- [ ] Implement JWT storage and refresh logic
- [ ] Add HTTP interceptor for auth headers
- [ ] Create auth guard for protected routes
- [ ] Build logout functionality
- [ ] Add auth state management (signals/observables)
- [ ] Add role-aware navigation and route guards for web/tablet/mobile surfaces
- [ ] Write unit tests for auth service

#### Testing & Documentation
- [ ] E2E tests: successful login flow
- [ ] E2E tests: failed login attempts create audit events
- [ ] E2E tests: protected routes redirect unauthenticated users
- [ ] E2E tests: permission-based route access
- [ ] Document authentication flows in README
- [ ] Create API authentication guide in documentation/

---

## Sprint 2: Device Management & Identity (Weeks 3-4)

**Goal:** Enable device registration, authentication, and event ingestion with proper identity and audit trails.

### Sprint Acceptance Criteria

- [ ] Devices can register with unique identity and receive scoped tokens
- [ ] Device authentication validates device tokens
- [ ] Device heartbeat endpoint tracks online/offline status
- [ ] Device events create ledger entries with device actor context
- [ ] Device revocation immediately blocks access
- [ ] Nonce validation prevents replay attacks
- [ ] Device status visible in admin UI

### Tasks

#### Backend Device System
- [ ] Create `devices` module in ledger-api
- [ ] Create `Device` entity with TypeORM
- [ ] Implement device registration endpoint (`POST /api/v1/devices/register`)
- [ ] Build device token generation (scoped JWT or API key)
- [ ] Create `DeviceAuthGuard` for device endpoints
- [ ] Implement heartbeat endpoint (`POST /api/v1/devices/heartbeat`)
- [ ] Add device status endpoint (`GET /api/v1/devices/:id/status`)
- [ ] Create device event ingestion endpoint (`POST /api/v1/device-events`)
- [ ] Implement batch device event endpoint (`POST /api/v1/device-events/batch`)
- [ ] Add nonce tracking for replay protection (Redis-backed)
- [ ] Build device revocation logic with immediate token invalidation
- [ ] Create device-related ledger event types (DEVICE_REGISTERED, DEVICE_HEARTBEAT, DEVICE_REVOKED)
- [ ] Write behavior-focused unit tests for device service
- [ ] Write integration tests for device registration and auth
- [ ] Add OpenAPI documentation for device endpoints

#### Contract Updates
- [ ] Create device registration schema in device-contracts
- [ ] Add device event batch schema
- [ ] Define device status enums and schemas
- [ ] Add device authentication request/response schemas

#### Frontend Device Management
- [ ] Create `DeviceService` in ledger-web
- [ ] Build device registry page (`/devices`)
- [ ] Add device registration form
- [ ] Display device list with status indicators
- [ ] Show device heartbeat timestamps
- [ ] Implement device revocation UI
- [ ] Add device event stream view
- [ ] Write unit tests for device service

#### Testing & Documentation
- [ ] E2E tests: device registration flow
- [ ] E2E tests: device authentication and event submission
- [ ] E2E tests: revoked devices cannot submit events
- [ ] E2E tests: batch device events processed correctly
- [ ] E2E tests: nonce replay protection works
- [ ] Document device registration flow
- [ ] Create device integration guide for hardware partners

---

## Sprint 3: Orders Module & Ledger Integration (Weeks 5-6)

**Goal:** Implement order lifecycle management with full ledger audit trail and proof generation.

### Sprint Acceptance Criteria

- [ ] Orders can be created with proper validation
- [ ] Order status changes create ledger events
- [ ] Order history fully auditable via ledger
- [ ] Order proofs generated for verification
- [ ] Correlation IDs link related order events
- [ ] Order list and detail views functional in UI
- [ ] Integration tests validate order workflows

### Tasks

#### Backend Orders System
- [ ] Create `orders` module in ledger-api
- [ ] Create `Order` entity with TypeORM (id, tenant_id, status, customer_id, items, created_at, updated_at)
- [ ] Implement create order endpoint (`POST /api/v1/orders`)
- [ ] Add update order status endpoint (`PATCH /api/v1/orders/:id/status`)
- [ ] Build order retrieval endpoints (`GET /api/v1/orders`, `GET /api/v1/orders/:id`)
- [ ] Create order cancellation endpoint (`POST /api/v1/orders/:id/cancel`)
- [ ] Implement order ledger event types (ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_CANCELLED)
- [ ] Add correlation ID tracking for related order events
- [ ] Build order proof generation logic
- [ ] Create order search with filtering (status, date range, customer)
- [ ] Write behavior-focused unit tests for order service
- [ ] Write integration tests for order lifecycle
- [ ] Add OpenAPI documentation for order endpoints

#### Contract Updates
- [ ] Create order schemas in shared-models (CreateOrderDto, UpdateOrderDto, OrderResponse)
- [ ] Add order status enum
- [ ] Define order item schemas
- [ ] Add order proof schema

#### Frontend Orders Management
- [ ] Create `OrderService` in ledger-web
- [ ] Build orders list page (`/orders`)
- [ ] Create order detail page (`/orders/:id`)
- [ ] Add order creation form
- [ ] Display order status timeline
- [ ] Show related ledger events for each order
- [ ] Implement order search and filters
- [ ] Add order proof view/download
- [ ] Write unit tests for order service

#### Testing & Documentation
- [ ] E2E tests: create order workflow
- [ ] E2E tests: order status updates create ledger events
- [ ] E2E tests: order cancellation workflow
- [ ] E2E tests: order proof generation and verification
- [ ] E2E tests: order search and filtering
- [ ] Document order API workflows
- [ ] Create order integration guide for partners

---

## Sprint 4: Inventory Module & Provenance (Weeks 7-8)

**Goal:** Build inventory tracking with provenance verification and device scan integration.

### Sprint Acceptance Criteria

- [ ] Inventory items tracked with unique identifiers
- [ ] Inventory operations (add, reserve, move, remove) create ledger events
- [ ] Device scans update inventory with actor attribution
- [ ] Inventory provenance traceable through ledger
- [ ] Inventory alerts for low stock/anomalies
- [ ] Inventory dashboard shows real-time status
- [ ] Integration with device events for automated tracking

### Tasks

#### Backend Inventory System
- [ ] Create `inventory` module in ledger-api
- [ ] Create `InventoryItem` entity with TypeORM (id, sku, location, quantity, status, metadata)
- [ ] Implement add inventory endpoint (`POST /api/v1/inventory`)
- [ ] Create reserve inventory endpoint (`PATCH /api/v1/inventory/:id/reserve`)
- [ ] Build move inventory endpoint (`PATCH /api/v1/inventory/:id/move`)
- [ ] Add remove inventory endpoint (`DELETE /api/v1/inventory/:id`)
- [ ] Implement inventory scan endpoint (`POST /api/v1/inventory/scan`)
- [ ] Create inventory ledger event types (INVENTORY_ADDED, INVENTORY_RESERVED, INVENTORY_MOVED, INVENTORY_REMOVED, INVENTORY_SCANNED)
- [ ] Build provenance query endpoint (trace item history)
- [ ] Implement inventory anomaly detection (unexpected moves, missing items)
- [ ] Add inventory search with filters (location, SKU, status)
- [ ] Write behavior-focused unit tests for inventory service
- [ ] Write integration tests for inventory operations
- [ ] Add OpenAPI documentation for inventory endpoints

#### Contract Updates
- [ ] Create inventory schemas (InventoryItemDto, ReserveInventoryDto, MoveInventoryDto)
- [ ] Add inventory status enum
- [ ] Define scan event schema
- [ ] Add provenance response schema

#### Frontend Inventory Management
- [ ] Create `InventoryService` in ledger-web
- [ ] Build inventory list page (`/inventory`)
- [ ] Create inventory detail page with provenance timeline
- [ ] Add inventory operation forms (add, reserve, move)
- [ ] Display inventory scan events from devices
- [ ] Show inventory alerts and anomalies
- [ ] Implement inventory search and filters
- [ ] Add provenance visualization
- [ ] Write unit tests for inventory service

#### Testing & Documentation
- [ ] E2E tests: add inventory workflow
- [ ] E2E tests: reserve/move inventory operations
- [ ] E2E tests: device scan updates inventory
- [ ] E2E tests: provenance trace shows complete history
- [ ] E2E tests: inventory anomalies detected
- [ ] Document inventory tracking workflows
- [ ] Create inventory integration guide

---

## Sprint 5: WebSocket Notifications & Production Infrastructure (Weeks 9-10)

**Goal:** Enable real-time updates via WebSockets and deploy production-ready infrastructure with monitoring.

### Sprint Acceptance Criteria

- [ ] WebSocket server operational with authentication
- [ ] Real-time notifications delivered to connected clients
- [ ] Clients can subscribe to specific event types/subjects
- [ ] WebSocket connections gracefully handle reconnection
- [ ] Nginx reverse proxy configured for all services
- [ ] Prometheus + Grafana monitoring operational
- [ ] Production environment variables configured
- [ ] Health check endpoints implemented
- [ ] Production Docker Compose stack deployed

### Tasks

#### Backend WebSocket Implementation
- [ ] Add `@nestjs/websockets` and `socket.io` dependencies
- [ ] Create `notifications` module in ledger-api
- [ ] Implement WebSocket gateway with authentication
- [ ] Build subscription system (by event type, subject, tenant)
- [ ] Emit notifications on ledger event creation
- [ ] Add WebSocket connection management
- [ ] Implement room-based event broadcasting
- [ ] Create heartbeat/ping-pong for connection health
- [ ] Write unit tests for notification gateway
- [ ] Write integration tests for WebSocket events

#### Frontend WebSocket Integration
- [ ] Create `NotificationService` in ledger-web
- [ ] Implement Socket.IO client connection
- [ ] Add authentication to WebSocket handshake
- [ ] Build event subscription management
- [ ] Create notification UI component
- [ ] Display real-time ledger events in dashboard
- [ ] Add connection status indicator
- [ ] Implement reconnection logic
- [ ] Write unit tests for notification service

#### Infrastructure & Monitoring
- [ ] Create production docker-compose.yml
- [ ] Add Nginx service with reverse proxy configuration
- [ ] Configure Nginx SSL/TLS (self-signed for dev)
- [ ] Add Prometheus service for metrics collection
- [ ] Configure Grafana with default dashboards
- [ ] Implement health check endpoints (`/api/health`, `/api/ready`)
- [ ] Add Prometheus metrics to NestJS app
- [ ] Create dashboard for API metrics (requests, latency, errors)
- [ ] Add database connection pool monitoring
- [ ] Configure log aggregation (basic stdout/stderr)
- [ ] Document production deployment process
- [ ] Create environment variable reference guide

#### OpenAPI & Documentation
- [ ] Generate OpenAPI/Swagger documentation
- [ ] Add Swagger UI endpoint (`/api/docs`)
- [ ] Document all endpoints with examples
- [ ] Add authentication documentation to Swagger
- [ ] Create API versioning strategy
- [ ] Publish API changelog

#### Testing & Documentation
- [ ] E2E tests: WebSocket connection and authentication
- [ ] E2E tests: real-time notifications delivered correctly
- [ ] E2E tests: subscription filtering works
- [ ] E2E tests: reconnection after disconnect
- [ ] Load tests: API under concurrent users
- [ ] Load tests: WebSocket concurrent connections
- [ ] Document WebSocket integration guide
- [ ] Create production deployment runbook
- [ ] Update README with production setup

---

## PI Risks & Dependencies

### High Risks
- **Performance:** WebSocket scalability with high device connection counts (mitigation: load test early, plan Redis adapter)
- **Security:** Device token management complexity (mitigation: clear revocation strategy, audit all auth events)
- **Data Integrity:** Ledger hash chain consistency under concurrent writes (mitigation: database transaction isolation, integration tests)

### Medium Risks
- **Technical Debt:** Contract library synchronization between frontend/backend (mitigation: automated validation tests)
- **Scope Creep:** Additional actor types or permission models (mitigation: defer to PI-2)
- **Infrastructure:** Production deployment complexity (mitigation: comprehensive documentation, rehearsal in staging)

### Dependencies
- PostgreSQL 16+ for JSONB and performance
- Redis 7+ for rate limiting, caching, and nonce tracking
- Docker Compose for local and production deployment
- Node.js 20+ LTS for runtime stability

### Assumptions
- Single-tenant per environment initially (multi-tenancy via tenant_id in data)
- REST-first, MQTT deferred to PI-2
- Self-signed certificates acceptable for initial production
- Basic monitoring sufficient (advanced APM in PI-2)

---

## PI Demo & Retrospective

### Demo Objectives (Week 10)
- Live demonstration of complete order workflow with device scan
- Show real-time dashboard updates via WebSocket
- Demonstrate device registration and event submission
- Prove ledger audit trail completeness
- Display public proof verification
- Showcase monitoring dashboards

### Retrospective Focus Areas
- Test coverage and quality gate effectiveness
- Contract library synchronization challenges
- WebSocket performance and stability
- Development velocity and estimation accuracy
- Technical debt accumulation
- Team collaboration and communication

---

## Post-PI Backlog Preview (PI-2 Candidates)

**Donations Module:**
- Donation tracking and disbursement
- Public donation proof pages
- QR code generation for proofs

**Anomaly Detection:**
- Fraud pattern detection
- Automated alerts for suspicious events
- ML-based anomaly scoring

**Advanced Device Features:**
- MQTT broker integration
- mTLS device authentication
- Certificate rotation
- Edge gateway support

**Mobile & Tablet Optimized UI:**
- Touch-first operation flows
- Mobile scan and approve workflows
- Offline-capable device apps

**Advanced Monitoring:**
- APM integration (New Relic/Datadog)
- Distributed tracing
- Advanced alerting rules
- SLA monitoring

**Performance Optimization:**
- Query optimization and indexing
- Redis caching layer
- Read replica support
- CDN for static assets
