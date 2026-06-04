# Sprint 5: WebSocket Notifications & Production Infrastructure

**Sprint Duration:** 2 weeks (July 29 - August 11, 2026)  
**Sprint Goal:** Enable real-time updates via WebSockets and deploy production-ready infrastructure with monitoring.
**Status:** Planned (not started as of 2026-06-04)

---

## Sprint Acceptance Criteria

- [ ] WebSocket server operational with authentication
- [ ] Real-time notifications delivered to connected clients
- [ ] Clients can subscribe to specific event types/subjects
- [ ] WebSocket connections gracefully handle reconnection
- [ ] Nginx reverse proxy configured for all services
- [ ] Prometheus + Grafana monitoring operational
- [ ] Production environment variables configured
- [ ] Health check endpoints implemented
- [ ] Production Docker Compose stack deployed
- [ ] OpenAPI/Swagger documentation complete
- [ ] Live operations UI shows connection state, event feed highlights, readiness score, and demo mode using shared visual primitives

---

## Backend WebSocket Implementation

### WebSocket Setup
- [ ] Install `@nestjs/websockets` and `@nestjs/platform-socket.io`
- [ ] Install `socket.io` dependencies
- [ ] Generate `notifications` module
- [ ] Generate `notifications` gateway

### WebSocket Gateway
- [ ] Create NotificationsGateway class
  - [ ] Extend @WebSocketGateway decorator
  - [ ] Configure CORS for WebSocket
  - [ ] Set namespace to '/ws'
- [ ] Implement handleConnection lifecycle
  - [ ] Validate client authentication
  - [ ] Extract JWT from handshake
  - [ ] Store authenticated client mapping
  - [ ] Log connection with client ID
- [ ] Implement handleDisconnect lifecycle
  - [ ] Clean up client subscriptions
  - [ ] Remove from active clients map
  - [ ] Log disconnection
- [ ] Add connection heartbeat/ping-pong
  - [ ] Send ping every 30 seconds
  - [ ] Disconnect unresponsive clients

### WebSocket Authentication
- [ ] Create WebSocket auth middleware
  - [ ] Extract token from handshake auth header
  - [ ] Validate JWT token
  - [ ] Attach user/actor to socket
  - [ ] Reject unauthenticated connections
- [ ] Add tenant isolation for subscriptions
- [ ] Validate client permissions for event types

### Subscription Management
- [ ] Implement @SubscribeMessage('subscribe') handler
  - [ ] Accept subscription filters (event_type, subject_type, subject_id)
  - [ ] Join Socket.IO rooms based on filters
  - [ ] Store subscription preferences
  - [ ] Return subscription confirmation
- [ ] Implement @SubscribeMessage('unsubscribe') handler
  - [ ] Leave Socket.IO rooms
  - [ ] Remove subscription preferences
  - [ ] Return unsubscribe confirmation
- [ ] Create room naming strategy
  - [ ] tenant:{tenant_id}
  - [ ] event_type:{type}
  - [ ] subject:{type}:{id}
  - [ ] actor:{type}:{id}
- [ ] Add wildcard subscriptions (all events for tenant)

### Event Broadcasting
- [ ] Integrate with LedgerEventsService
  - [ ] Hook into event creation
  - [ ] Broadcast to relevant rooms
  - [ ] Include complete event data
- [ ] Implement notification priority
  - [ ] High priority (order status, anomalies)
  - [ ] Normal priority (scans, heartbeats)
  - [ ] Low priority (analytics)
- [ ] Add notification rate limiting per client
- [ ] Implement server-side event filtering

### WebSocket Endpoints
- [ ] Implement @SubscribeMessage('get_status')
  - [ ] Return server status
  - [ ] Return client subscriptions
  - [ ] Return connection info
- [ ] Implement @SubscribeMessage('ping')
  - [ ] Return pong with timestamp
- [ ] Add error handling for all handlers
- [ ] Log all WebSocket events

### Notification Types
- [ ] Create notification event schemas
  - [ ] LEDGER_EVENT_CREATED
  - [ ] ORDER_STATUS_CHANGED
  - [ ] INVENTORY_LOW_STOCK
  - [ ] DEVICE_HEARTBEAT_MISSED
  - [ ] ANOMALY_DETECTED
  - [ ] SYSTEM_ALERT
- [ ] Add notification metadata (priority, category)

### Unit Tests
- [ ] Gateway tests
  - [ ] Test connection handling
  - [ ] Test authentication
  - [ ] Test subscription management
  - [ ] Test event broadcasting
  - [ ] Test disconnection cleanup
- [ ] Subscription tests
  - [ ] Test room joining/leaving
  - [ ] Test filter matching
  - [ ] Test tenant isolation
- [ ] Authentication tests
  - [ ] Test valid token acceptance
  - [ ] Test invalid token rejection
  - [ ] Test token expiration

### Integration Tests
- [ ] WebSocket connection integration test
  - [ ] Connect with valid JWT
  - [ ] Verify connection accepted
  - [ ] Verify disconnect handled
- [ ] Subscription integration test
  - [ ] Subscribe to event type
  - [ ] Create matching event
  - [ ] Verify notification received
- [ ] Authentication integration test
  - [ ] Connect without token
  - [ ] Verify rejection
  - [ ] Connect with invalid token
  - [ ] Verify rejection
- [ ] Broadcasting integration test
  - [ ] Multiple clients subscribe
  - [ ] Create event
  - [ ] Verify all receive notification
- [ ] Filtering integration test
  - [ ] Subscribe to specific subject
  - [ ] Create matching and non-matching events
  - [ ] Verify only matching received

---

## Frontend WebSocket Integration

### Notification Service
- [ ] Create notification.service.ts
- [ ] Install `socket.io-client` dependency
- [ ] Implement WebSocket connection
  - [ ] Connect with JWT in auth header
  - [ ] Handle connection success
  - [ ] Handle connection errors
  - [ ] Implement auto-reconnection logic
- [ ] Create connection status observable
- [ ] Implement subscribe method
  - [ ] Send subscribe message
  - [ ] Return observable for notifications
- [ ] Implement unsubscribe method
- [ ] Handle disconnection
- [ ] Add connection heartbeat monitoring

### Notification UI Component
- [ ] Create notification.component.ts
- [ ] Display connection status indicator
  - [ ] Green: connected
  - [ ] Yellow: connecting
  - [ ] Red: disconnected
- [ ] Show notification badge count
- [ ] Implement notification dropdown
  - [ ] List recent notifications
  - [ ] Show timestamp
  - [ ] Show event type
  - [ ] Add mark as read
  - [ ] Add clear all
- [ ] Add notification sound (optional)
- [ ] Add browser notifications API integration
- [ ] Reuse shared connection status, ledger event card, status chip, and empty state components
- [ ] Add event highlight animation with reduced-motion fallback
- [ ] Add notification severity iconography through Material Icons

### Real-time Updates Integration
- [ ] Update DashboardPage with real-time data
  - [ ] Subscribe to relevant events
  - [ ] Update metrics on notification
  - [ ] Show live event feed
- [ ] Update LedgerEventsPage with real-time events
  - [ ] Subscribe to LEDGER_EVENT_CREATED
  - [ ] Prepend new events to list
  - [ ] Highlight new events
- [ ] Update OrdersPage with status updates
  - [ ] Subscribe to ORDER_STATUS_CHANGED
  - [ ] Update order list dynamically
- [ ] Update InventoryPage with scan updates
  - [ ] Subscribe to INVENTORY_SCANNED
  - [ ] Update inventory counts
- [ ] Add live operations board showing system readiness, active connections, recent verified events, open anomalies, and device heartbeat health
- [ ] Add PI demo mode seeded by real API state or approved fixtures, never hardcoded success states

### Reconnection Logic
- [ ] Implement exponential backoff
  - [ ] 1s, 2s, 4s, 8s, 16s, max 30s
- [ ] Handle reconnection success
  - [ ] Re-subscribe to previous subscriptions
  - [ ] Fetch missed events from API
- [ ] Handle maximum retry exceeded
  - [ ] Show error message
  - [ ] Provide manual retry button

### Unit Tests
- [ ] Notification service tests
  - [ ] Test connection
  - [ ] Test subscription
  - [ ] Test disconnection
  - [ ] Test reconnection
  - [ ] Test error handling
- [ ] Notification component tests
  - [ ] Test badge display
  - [ ] Test notification list
  - [ ] Test mark as read
  - [ ] Test connection indicator
  - [ ] Test connection status visual states for connected, connecting, reconnecting, disconnected, and failed
  - [ ] Test live event feed highlight state with reduced-motion mode
  - [ ] Test readiness score derives from API/WebSocket/ledger inputs
  - [ ] Test demo mode uses approved API-backed fixtures instead of hardcoded success state

---

## Infrastructure & Monitoring

### Nginx Configuration
- [ ] Create nginx.conf
- [ ] Configure reverse proxy
  - [ ] / → ledger-web (port 4200)
  - [ ] /api → ledger-api (port 3000)
  - [ ] /ws → WebSocket upgrade (port 3000)
- [ ] Add SSL/TLS configuration
  - [ ] Generate self-signed cert for dev
  - [ ] Configure cert paths
  - [ ] Redirect HTTP to HTTPS
- [ ] Configure proxy headers
  - [ ] X-Real-IP
  - [ ] X-Forwarded-For
  - [ ] X-Forwarded-Proto
- [ ] Add gzip compression
- [ ] Configure cache headers for static assets
- [ ] Add rate limiting
- [ ] Configure WebSocket upgrade headers

### Health Check Endpoints
- [ ] Implement GET /api/health endpoint
  - [ ] Return 200 OK if service running
  - [ ] Include service name and version
  - [ ] Check database connectivity
  - [ ] Check Redis connectivity
- [ ] Implement GET /api/ready endpoint
  - [ ] Return 200 when fully initialized
  - [ ] Check all dependencies ready
  - [ ] Used by container orchestration
- [ ] Implement GET /api/metrics endpoint
  - [ ] Return Prometheus-formatted metrics
  - [ ] Include HTTP request metrics
  - [ ] Include database query metrics
  - [ ] Include WebSocket connection count

### Prometheus Integration
- [ ] Install `@willsoto/nestjs-prometheus`
- [ ] Configure PrometheusModule
- [ ] Add custom metrics
  - [ ] http_requests_total (counter)
  - [ ] http_request_duration_seconds (histogram)
  - [ ] ledger_events_created_total (counter)
  - [ ] websocket_connections_active (gauge)
  - [ ] database_query_duration_seconds (histogram)
  - [ ] device_heartbeats_total (counter)
- [ ] Create prometheus.yml config
- [ ] Configure scrape targets
  - [ ] ledger-api:3000/api/metrics
- [ ] Set scrape interval (15s)

### Grafana Setup
- [ ] Create grafana.ini config
- [ ] Configure data source (Prometheus)
- [ ] Create default dashboard
  - [ ] API request rate panel
  - [ ] API latency panel (p50, p95, p99)
  - [ ] Error rate panel
  - [ ] Database query performance
  - [ ] WebSocket connection count
  - [ ] Ledger event creation rate
  - [ ] Device heartbeat rate
- [ ] Add alert rules
  - [ ] High error rate (> 5%)
  - [ ] High latency (p95 > 1s)
  - [ ] Database connection failures
  - [ ] WebSocket connection drops
- [ ] Export dashboard JSON
- [ ] Add dashboard provisioning

### Docker Compose Production
- [ ] Create docker-compose.production.yml
- [ ] Add all services
  - [ ] nginx (port 80, 443)
  - [ ] ledger-web
  - [ ] ledger-api
  - [ ] postgres
  - [ ] redis
  - [ ] prometheus
  - [ ] grafana (port 3001)
  - [ ] pgadmin (optional, port 5050)
- [ ] Configure service dependencies
- [ ] Add health checks for all services
- [ ] Configure restart policies (always)
- [ ] Set resource limits (memory, CPU)
- [ ] Configure logging (json-file driver)
- [ ] Add volumes for persistence
  - [ ] postgres-data
  - [ ] redis-data
  - [ ] grafana-data
  - [ ] prometheus-data
- [ ] Configure networks
  - [ ] frontend-network
  - [ ] backend-network
  - [ ] monitoring-network

### Environment Configuration
- [ ] Update deployment secret documentation with production variables
  - [ ] Add all required variables
  - [ ] Document each variable
  - [ ] Avoid committed production defaults for secrets
  - [ ] Add security recommendations
- [ ] Add validation for required env vars
- [ ] Document secret management

### Production Deployment
- [ ] Create deployment scripts
  - [ ] build.sh (build all images)
  - [ ] deploy.sh (start production stack)
  - [ ] backup.sh (backup database)
  - [ ] restore.sh (restore database)
- [ ] Add pre-deployment checks
  - [ ] Verify env vars set
  - [ ] Check SSL certs valid
  - [ ] Validate database migrations
- [ ] Create rollback procedure
- [ ] Document deployment process

### Security Hardening
- [ ] Configure security headers in Nginx
  - [ ] X-Frame-Options: DENY
  - [ ] X-Content-Type-Options: nosniff
  - [ ] X-XSS-Protection: 1; mode=block
  - [ ] Strict-Transport-Security
  - [ ] Content-Security-Policy
- [ ] Remove debug endpoints in production
- [ ] Disable CORS in production (Nginx handles it)
- [ ] Configure rate limiting rules
- [ ] Add fail2ban for SSH (if applicable)

---

## OpenAPI Documentation

### Swagger Setup
- [ ] Install `@nestjs/swagger`
- [ ] Configure SwaggerModule
  - [ ] Set title, description, version
  - [ ] Add server URL
  - [ ] Configure authentication
- [ ] Mount at /api/docs
- [ ] Add API tags for grouping
- [ ] Configure DTO decorators
  - [ ] @ApiProperty on all fields
  - [ ] @ApiPropertyOptional for optional
  - [ ] Add examples

### API Documentation
- [ ] Document all endpoints
  - [ ] Add @ApiOperation descriptions
  - [ ] Add @ApiResponse for all codes
  - [ ] Add @ApiParam for path params
  - [ ] Add @ApiQuery for query params
  - [ ] Add @ApiBody for request bodies
- [ ] Add authentication documentation
  - [ ] Document JWT auth
  - [ ] Document device auth
  - [ ] Add bearer token example
- [ ] Create example requests/responses
- [ ] Add error response examples
- [ ] Document rate limiting
- [ ] Add versioning info

### API Changelog
- [ ] Create CHANGELOG.md
- [ ] Document v1.0.0 release
  - [ ] All endpoints
  - [ ] Breaking changes (none yet)
  - [ ] Deprecations (none yet)
- [ ] Add versioning strategy
- [ ] Document migration guides (future)

---

## E2E Testing

### WebSocket E2E Tests
- [ ] Test WebSocket connection
  - [ ] Connect with valid auth
  - [ ] Verify connection success
- [ ] Test real-time notifications
  - [ ] Subscribe to event type
  - [ ] Trigger event via API
  - [ ] Verify notification received in UI
- [ ] Test reconnection
  - [ ] Connect
  - [ ] Simulate disconnect
  - [ ] Verify auto-reconnect
- [ ] Test subscription filtering
  - [ ] Subscribe to specific subject
  - [ ] Create various events
  - [ ] Verify only relevant received
- [ ] Test connection status indicator renders connected, reconnecting, disconnected, and failed states
- [ ] Test live event feed highlights new events without breaking reduced-motion mode
- [ ] Test live operations board readiness score derives from API/WebSocket/ledger state
- [ ] Test demo mode renders from real API state or approved fixtures and labels fixture-backed data clearly
- [ ] Test live operations cards do not horizontally overflow or clip connection/readiness text on mobile, tablet, or desktop

### Production Infrastructure E2E
- [ ] Test health endpoints
  - [ ] GET /api/health returns 200
  - [ ] GET /api/ready returns 200
- [ ] Test Nginx proxy
  - [ ] HTTP redirects to HTTPS
  - [ ] /api proxies to backend
  - [ ] /ws upgrades WebSocket
  - [ ] Static assets served
- [ ] Test monitoring
  - [ ] Prometheus scraping metrics
  - [ ] Grafana dashboard loading
  - [ ] Metrics updating

---

## Documentation

### Production Documentation
- [ ] Create DEPLOYMENT.md
  - [ ] Prerequisites
  - [ ] Installation steps
  - [ ] Configuration guide
  - [ ] Starting/stopping services
  - [ ] Troubleshooting
- [ ] Create MONITORING.md
  - [ ] Grafana access
  - [ ] Dashboard overview
  - [ ] Alert configuration
  - [ ] Metric definitions
- [ ] Create BACKUP.md
  - [ ] Backup procedures
  - [ ] Restore procedures
  - [ ] Disaster recovery
- [ ] Update README with production info
- [ ] Document live operations visual state model, readiness score inputs, connection state labels, event highlight rules, and demo mode data policy

### API Documentation
- [ ] Publish Swagger docs
- [ ] Create API integration guide
- [ ] Document authentication flows
- [ ] Add code examples (curl, Python, Node.js)
- [ ] Create troubleshooting guide

---

## Definition of Done

A task is considered complete when:
- [ ] Code written and follows coding standards
- [ ] Unit tests written and passing (90%+ coverage)
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing
- [ ] Code reviewed and approved
- [ ] OpenAPI documentation updated
- [ ] Production documentation complete
- [ ] No critical or high severity bugs
- [ ] Deployed to production environment
- [ ] Demo-ready for PI review

---

## Sprint Risks

### High Priority Risks
- **WebSocket Scalability:** May need Redis adapter for horizontal scaling (mitigation: plan for adapter, test load)
- **Production Deployment:** First production deployment may have issues (mitigation: staging environment, thorough testing)
- **SSL Certificate:** Self-signed certs not suitable for public (mitigation: document Let's Encrypt for production)

### Medium Priority Risks
- **Monitoring Setup:** Grafana/Prometheus configuration complex (mitigation: use proven templates)
- **Connection Stability:** WebSocket connections may drop (mitigation: robust reconnection logic)

---

## PI-1 Completion

This sprint is planned to complete Program Increment 1 with the following target deliverables:

- [ ] Complete authentication system
- [ ] Device management and ingestion
- [ ] Orders with full audit trail
- [ ] Inventory with provenance
- [ ] Real-time WebSocket notifications
- [ ] Production infrastructure
- [ ] Comprehensive monitoring
- [ ] Complete API documentation

**Next PI Preview:** See PI-2 planning for advanced features (donations, anomaly detection, MQTT, mobile UI)
