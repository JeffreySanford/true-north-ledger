import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { AppModule } from '../app.module';
import { RateLimitGuard } from './rate-limit.guard';
import { ROLE_NAMES } from './role-permissions';

const DEFAULT_AUTH_USERNAME = 'admin';
const DEFAULT_AUTH_PASSWORD = 'admin';
const DEFAULT_AUTH_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const originalRateLimitMax = process.env.LEDGER_RATE_LIMIT_MAX;
const originalRateLimitWindow = process.env.LEDGER_RATE_LIMIT_WINDOW_MS;
const originalGlobalRateLimitMax = process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX;
const originalGlobalRateLimitWindow = process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS;

describe('AuthController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rateLimitGuard: RateLimitGuard;
  let jwtService: JwtService;
  let authUsername: string;
  let authPassword: string;
  let authTenantId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
    process.env.AUTH_USERNAME = process.env.AUTH_USERNAME ?? DEFAULT_AUTH_USERNAME;
    process.env.AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? DEFAULT_AUTH_PASSWORD;
    process.env.AUTH_TENANT_ID = process.env.AUTH_TENANT_ID ?? DEFAULT_AUTH_TENANT_ID;
    process.env.JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION ?? '1d';
    process.env.LEDGER_RATE_LIMIT_MAX = '1000';
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = '1000';
    process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';
    authUsername = process.env.AUTH_USERNAME ?? DEFAULT_AUTH_USERNAME;
    authPassword = process.env.AUTH_PASSWORD ?? DEFAULT_AUTH_PASSWORD;
    authTenantId = process.env.AUTH_TENANT_ID ?? DEFAULT_AUTH_TENANT_ID;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    rateLimitGuard = app.get<RateLimitGuard>(RateLimitGuard);
    jwtService = app.get<JwtService>(JwtService);
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await dataSource.query('TRUNCATE TABLE ledger_events CASCADE');
  });

  beforeEach(() => {
    rateLimitGuard.reset();
  });

  afterAll(async () => {
    process.env.LEDGER_RATE_LIMIT_MAX = originalRateLimitMax;
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = originalRateLimitWindow;
    process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = originalGlobalRateLimitMax;
    process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS = originalGlobalRateLimitWindow;
    await app?.close();
  });

  it('authenticates valid credentials and creates a login ledger event', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'auth-integration-suite')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const loginUserId = response.body.user.userId;

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        userId: loginUserId,
        username: authUsername,
        actorType: 'user',
        tenantId: authTenantId,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = await dataSource.query(
      `SELECT type, subject_type, subject_id, result FROM ledger_events WHERE subject_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [loginUserId],
    );

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe('LEDGER_EVENT');
    expect(events[0].subject_type).toBe('auth');
    expect(events[0].subject_id).toBe(loginUserId);

    const loginSuccessEvents = await dataSource.query(
        `SELECT payload->>'action' AS action, actor_type, actor_id, source_ip, user_agent, result FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.LOGIN_SUCCESS}' ORDER BY created_at DESC LIMIT 1`,
      [loginUserId],
    );

    expect(loginSuccessEvents.length).toBeGreaterThanOrEqual(1);
    expect(loginSuccessEvents[0].action).toBe(AuthLedgerEventAction.LOGIN_SUCCESS);
      expect(loginSuccessEvents[0].actor_type).toBe('user');
      expect(loginSuccessEvents[0].actor_id).toBe(loginUserId);
      expect(loginSuccessEvents[0].source_ip).toBeTruthy();
      expect(loginSuccessEvents[0].user_agent).toContain('auth-integration-suite');
      expect(loginSuccessEvents[0].result).toBe('accepted');
  });

  it('rejects invalid login credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: 'incorrect' })
      .expect(401);
  });

  it('records a login failed ledger event for invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: 'incorrect' })
      .expect(401);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'username' AS username FROM ledger_events WHERE payload->>'action' = '${AuthLedgerEventAction.LOGIN_FAILED}' ORDER BY created_at DESC LIMIT 1`,
    );

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].action).toBe(AuthLedgerEventAction.LOGIN_FAILED);
    expect(events[0].username).toBe(authUsername);
  });

  describe('Login rate limiting', () => {
    let rateLimitApp: INestApplication;
    const originalRateLimitMaxLocal = process.env.LEDGER_RATE_LIMIT_MAX;
    const originalRateLimitWindowLocal = process.env.LEDGER_RATE_LIMIT_WINDOW_MS;

    beforeAll(async () => {
      process.env.LEDGER_RATE_LIMIT_MAX = '5';
      process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '100';

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      rateLimitApp = moduleFixture.createNestApplication();
      rateLimitApp.setGlobalPrefix('api');
      rateLimitApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
      await rateLimitApp.init();
    });

    afterAll(async () => {
      await rateLimitApp?.close();
      process.env.LEDGER_RATE_LIMIT_MAX = originalRateLimitMaxLocal;
      process.env.LEDGER_RATE_LIMIT_WINDOW_MS = originalRateLimitWindowLocal;
    });

    it('enforces login rate limiting on the auth endpoint', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(rateLimitApp.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', '10.66.0.10')
          .send({ username: authUsername, password: authPassword })
          .expect(200);
      }

      await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.66.0.10')
        .send({ username: authUsername, password: authPassword })
        .expect(429);
    });
  });

  it('fails startup when JWT secret is missing', async () => {
    const existingJwtSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    await expect(
      Test.createTestingModule({
        imports: [AppModule],
      }).compile(),
    ).rejects.toThrow('Missing required environment variable: JWT_SECRET');

    process.env.JWT_SECRET = existingJwtSecret;
  });

  it('refreshes a valid refresh token and rotates tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'auth-integration-suite')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('User-Agent', 'auth-integration-suite')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(refresh.body.accessToken).toBeDefined();
    expect(refresh.body.refreshToken).toBeDefined();
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const refreshEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, actor_type, actor_id, source_ip, user_agent, result FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.TOKEN_REFRESHED}' ORDER BY created_at DESC LIMIT 1`,
      [login.body.user.userId],
    );

    expect(refreshEvents).toHaveLength(1);
    expect(refreshEvents[0].action).toBe(AuthLedgerEventAction.TOKEN_REFRESHED);
    expect(refreshEvents[0].actor_type).toBe('user');
    expect(refreshEvents[0].actor_id).toBe(login.body.user.userId);
    expect(refreshEvents[0].source_ip).toBeTruthy();
    expect(refreshEvents[0].user_agent).toContain('auth-integration-suite');
    expect(refreshEvents[0].result).toBe('accepted');
  });

  it('rejects refresh with an invalid token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);
  });

  it('creates and uses a service token for tenant-scoped API access', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'auth-integration-suite')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const createTokenResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/service-token')
      .set('User-Agent', 'auth-integration-suite')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ name: 'integration-service', permissions: ['ledger.read'] })
      .expect(201);

    expect(createTokenResponse.body).toMatchObject({
      id: expect.any(String),
      name: 'integration-service',
      permissions: ['ledger.read'],
      revoked: false,
    });
    expect(createTokenResponse.body.token).toBeTruthy();

    const serviceToken = createTokenResponse.body.token;

    const persistedServiceToken = await dataSource.query(
      `SELECT id, tenant_id, revoked, hashed_token FROM service_tokens WHERE id = $1`,
      [createTokenResponse.body.id],
    );

    expect(persistedServiceToken).toHaveLength(1);
    expect(persistedServiceToken[0].tenant_id).toBe(authTenantId);
    expect(persistedServiceToken[0].revoked).toBe(false);
    expect(persistedServiceToken[0].hashed_token).toMatch(/^[a-f0-9]{64}$/);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const createdEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, actor_type, actor_id, source_ip, user_agent, result FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.SERVICE_TOKEN_CREATED}' ORDER BY created_at DESC LIMIT 1`,
      [createTokenResponse.body.id],
    );

    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].action).toBe(AuthLedgerEventAction.SERVICE_TOKEN_CREATED);
    expect(createdEvents[0].actor_type).toBe('service');
    expect(createdEvents[0].actor_id).toBe(createTokenResponse.body.id);
    expect(createdEvents[0].source_ip).toBeTruthy();
    expect(createdEvents[0].user_agent).toContain('auth-integration-suite');
    expect(createdEvents[0].result).toBe('accepted');

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events')
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/service-token/${createTokenResponse.body.id}`)
      .set('User-Agent', 'auth-integration-suite')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    const revokedServiceToken = await dataSource.query(
      `SELECT revoked, revoked_at FROM service_tokens WHERE id = $1`,
      [createTokenResponse.body.id],
    );

    expect(revokedServiceToken).toHaveLength(1);
    expect(revokedServiceToken[0].revoked).toBe(true);
    expect(revokedServiceToken[0].revoked_at).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const revokedEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, actor_type, actor_id, source_ip, user_agent, result FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.SERVICE_TOKEN_REVOKED}' ORDER BY created_at DESC LIMIT 1`,
      [createTokenResponse.body.id],
    );

    expect(revokedEvents).toHaveLength(1);
    expect(revokedEvents[0].action).toBe(AuthLedgerEventAction.SERVICE_TOKEN_REVOKED);
    expect(revokedEvents[0].actor_type).toBe('service');
    expect(revokedEvents[0].actor_id).toBe(createTokenResponse.body.id);
    expect(revokedEvents[0].source_ip).toBeTruthy();
    expect(revokedEvents[0].user_agent).toContain('auth-integration-suite');
    expect(revokedEvents[0].result).toBe('accepted');

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events')
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(401);
  });

  it('seeds default role-permission mappings for the tenant', async () => {
    const rows = await dataSource.query(
      `SELECT role, permissions FROM tenant_role_permissions WHERE tenant_id = $1 ORDER BY role ASC`,
      [authTenantId],
    );

    expect(rows).toHaveLength(ROLE_NAMES.length);

    const roles = rows.map((row: { role: string }) => row.role).sort();
    expect(roles).toEqual([...ROLE_NAMES].sort());

    const adminRow = rows.find((row: { role: string }) => row.role === 'admin');
    expect(adminRow.permissions).toEqual(expect.arrayContaining(['users.manage', 'roles.manage', 'settings.write']));
  });

  it('seeds a default admin tenant user-role record', async () => {
    const rows = await dataSource.query(
      `SELECT tenant_id, user_id, username, roles, active FROM tenant_user_roles WHERE tenant_id = $1 AND user_id = 'admin' LIMIT 1`,
      [authTenantId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: authTenantId,
      user_id: 'admin',
      username: authUsername,
      active: true,
    });
    expect(rows[0].roles).toEqual(expect.arrayContaining(['admin']));
  });

  it('creates a PERMISSION_DENIED ledger event when access is denied', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const createTokenResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/service-token')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ name: 'limited-service', permissions: ['billing.read', 'billing.write'] })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events')
      .set('Authorization', `Bearer ${createTokenResponse.body.token}`)
      .expect(403);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.PERMISSION_DENIED}' ORDER BY created_at DESC LIMIT 1`,
      [createTokenResponse.body.id],
    );

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].action).toBe(AuthLedgerEventAction.PERMISSION_DENIED);
  });

  it('assigns user roles from admin endpoint and records role assignment audit event', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const assignment = await request(app.getHttpServer())
      .post('/api/v1/auth/users/user-ops-001/roles')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ username: 'ops.manager', roles: ['operations_manager'] })
      .expect(200);

    expect(assignment.body).toMatchObject({
      userId: 'user-ops-001',
      username: 'ops.manager',
      roles: ['operations_manager'],
      active: true,
    });
    expect(assignment.body.permissions).toEqual(expect.arrayContaining(['ledger.read', 'orders.read', 'shipping.read']));

    const persistedUserRole = await dataSource.query(
      `SELECT tenant_id, user_id, username, roles, active FROM tenant_user_roles WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [authTenantId, 'user-ops-001'],
    );

    expect(persistedUserRole).toHaveLength(1);
    expect(persistedUserRole[0]).toMatchObject({
      tenant_id: authTenantId,
      user_id: 'user-ops-001',
      username: 'ops.manager',
      active: true,
    });
    expect(persistedUserRole[0].roles).toEqual(['operations_manager']);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = 'ROLE_ASSIGNMENT_UPDATED' ORDER BY created_at DESC LIMIT 1`,
      ['user-ops-001'],
    );

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].action).toBe('ROLE_ASSIGNMENT_UPDATED');
  });

  it('rejects role assignment endpoint for non-admin callers', async () => {
    const nonAdminToken = jwtService.sign({
      sub: 'readonly-user',
      actorType: 'user',
      tenantId: authTenantId,
      permissions: ['ledger.read'],
      tokenType: 'access',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/users/user-ops-002/roles')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ username: 'ops.member', roles: ['viewer'] })
      .expect(403);
  });

  it('resolves permissions from assigned roles in guard flow for JWTs without direct permissions', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/users/user-auditor-001/roles')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ username: 'auditor.user', roles: ['auditor'] })
      .expect(200);

    const roleOnlyToken = jwtService.sign({
      sub: 'user-auditor-001',
      username: 'auditor.user',
      actorType: 'user',
      tenantId: authTenantId,
      tokenType: 'access',
      permissions: [],
      roles: [],
    });

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events/chain/verify')
      .set('Authorization', `Bearer ${roleOnlyToken}`)
      .expect(200);
  });

  it('deactivates a user from admin endpoint and records user deactivation audit event', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const deactivation = await request(app.getHttpServer())
      .post('/api/v1/auth/users/user-ops-003/deactivate')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ reason: 'Security hold' })
      .expect(200);

    expect(deactivation.body).toMatchObject({
      userId: 'user-ops-003',
      active: false,
      reason: 'Security hold',
    });

    const persistedUserRole = await dataSource.query(
      `SELECT user_id, active FROM tenant_user_roles WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [authTenantId, 'user-ops-003'],
    );

    expect(persistedUserRole).toHaveLength(1);
    expect(persistedUserRole[0]).toMatchObject({ user_id: 'user-ops-003', active: false });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = 'USER_DEACTIVATED' ORDER BY created_at DESC LIMIT 1`,
      ['user-ops-003'],
    );

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].action).toBe('USER_DEACTIVATED');
  });

  it('denies protected endpoint access for deactivated users even with direct permissions in token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/users/deactivated-user-001/deactivate')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ reason: 'Role removed' })
      .expect(200);

    const deactivatedUserToken = jwtService.sign({
      sub: 'deactivated-user-001',
      username: 'deactivated.user',
      actorType: 'user',
      tenantId: authTenantId,
      tokenType: 'access',
      permissions: ['ledger.read'],
      roles: [],
    });

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events')
      .set('Authorization', `Bearer ${deactivatedUserToken}`)
      .expect(403);
  });

  it('enforces permission guard matrix across protected auth and ledger endpoints', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    const adminToken = login.body.accessToken as string;
    const readToken = jwtService.sign({
      sub: 'matrix-read-user',
      username: 'matrix.read',
      actorType: 'user',
      tenantId: authTenantId,
      tokenType: 'access',
      permissions: ['ledger.read'],
      roles: [],
    });
    const writeToken = jwtService.sign({
      sub: 'matrix-write-user',
      username: 'matrix.write',
      actorType: 'user',
      tenantId: authTenantId,
      tokenType: 'access',
      permissions: ['ledger.write'],
      roles: [],
    });
    const auditToken = jwtService.sign({
      sub: 'matrix-audit-user',
      username: 'matrix.audit',
      actorType: 'user',
      tenantId: authTenantId,
      tokenType: 'access',
      permissions: ['ledger.audit'],
      roles: [],
    });

    const supportRoleId = 'matrix-support-user';
    const matrixEventId = 'matrix-event-001';

    const matrixCases: Array<{
      name: string;
      expectedStatus: number;
      run: () => Promise<request.Response>;
    }> = [
      {
        name: 'auth service-token create requires admin (deny)',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .post('/api/v1/auth/service-token')
          .set('Authorization', `Bearer ${readToken}`)
          .send({ name: 'matrix-non-admin-token', permissions: ['ledger.read'] }),
      },
      {
        name: 'auth role assignment requires admin (allow)',
        expectedStatus: 200,
        run: () => request(app.getHttpServer())
          .post(`/api/v1/auth/users/${supportRoleId}/roles`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ username: 'matrix.support', roles: ['support'] }),
      },
      {
        name: 'auth role assignment requires admin (deny)',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .post('/api/v1/auth/users/matrix-no-admin/roles')
          .set('Authorization', `Bearer ${readToken}`)
          .send({ username: 'matrix.noadmin', roles: ['viewer'] }),
      },
      {
        name: 'auth deactivate requires admin (allow)',
        expectedStatus: 200,
        run: () => request(app.getHttpServer())
          .post('/api/v1/auth/users/matrix-deactivate-allow/deactivate')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ reason: 'matrix validation' }),
      },
      {
        name: 'auth deactivate requires admin (deny)',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .post('/api/v1/auth/users/matrix-deactivate-deny/deactivate')
          .set('Authorization', `Bearer ${readToken}`)
          .send({ reason: 'matrix validation' }),
      },
      {
        name: 'ledger.read allows list events',
        expectedStatus: 200,
        run: () => request(app.getHttpServer())
          .get('/api/v1/ledger/events')
          .set('Authorization', `Bearer ${readToken}`),
      },
      {
        name: 'missing ledger.read denies list events',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .get('/api/v1/ledger/events')
          .set('Authorization', `Bearer ${writeToken}`),
      },
      {
        name: 'ledger.write allows append event',
        expectedStatus: 201,
        run: () => request(app.getHttpServer())
          .post('/api/v1/ledger/events')
          .set('Authorization', `Bearer ${writeToken}`)
          .send({
            type: 'LEDGER_EVENT',
            subjectType: 'auth',
            subjectId: matrixEventId,
            payload: { action: 'MATRIX_WRITE_ALLOWED' },
          }),
      },
      {
        name: 'missing ledger.write denies append event',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .post('/api/v1/ledger/events')
          .set('Authorization', `Bearer ${readToken}`)
          .send({
            type: 'LEDGER_EVENT',
            subjectType: 'auth',
            subjectId: 'matrix-event-denied',
            payload: { action: 'MATRIX_WRITE_DENIED' },
          }),
      },
      {
        name: 'ledger.audit allows chain verification',
        expectedStatus: 200,
        run: () => request(app.getHttpServer())
          .get('/api/v1/ledger/events/chain/verify')
          .set('Authorization', `Bearer ${auditToken}`),
      },
      {
        name: 'missing ledger.audit denies chain verification',
        expectedStatus: 403,
        run: () => request(app.getHttpServer())
          .get('/api/v1/ledger/events/chain/verify')
          .set('Authorization', `Bearer ${readToken}`),
      },
    ];

    for (const matrixCase of matrixCases) {
      const response = await matrixCase.run();
      expect(response.status).toBe(matrixCase.expectedStatus);
    }
  });

  describe('Rate limiting integration', () => {
    let rateLimitApp: INestApplication;
    let rateLimitDataSource: DataSource;
    let rateLimitGuardInstance: RateLimitGuard;
    let previousRateLimitMax: string | undefined;
    let previousRateLimitWindow: string | undefined;
    let previousGlobalRateLimitMax: string | undefined;
    let previousGlobalRateLimitWindow: string | undefined;

    beforeAll(async () => {
      previousRateLimitMax = process.env.LEDGER_RATE_LIMIT_MAX;
      previousRateLimitWindow = process.env.LEDGER_RATE_LIMIT_WINDOW_MS;
      previousGlobalRateLimitMax = process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX;
      previousGlobalRateLimitWindow = process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS;
      process.env.LEDGER_RATE_LIMIT_MAX = '1';
      process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '100';
      process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = '1000';
      process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      rateLimitApp = moduleFixture.createNestApplication();
      rateLimitApp.setGlobalPrefix('api');
      rateLimitApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
      await rateLimitApp.init();

      rateLimitDataSource = moduleFixture.get<DataSource>(DataSource);
      rateLimitGuardInstance = rateLimitApp.get<RateLimitGuard>(RateLimitGuard);
      await rateLimitDataSource.query('TRUNCATE TABLE ledger_events CASCADE');
    });

    beforeEach(async () => {
      rateLimitGuardInstance.reset();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    afterAll(async () => {
      await rateLimitApp?.close();
      process.env.LEDGER_RATE_LIMIT_MAX = previousRateLimitMax;
      process.env.LEDGER_RATE_LIMIT_WINDOW_MS = previousRateLimitWindow;
      process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = previousGlobalRateLimitMax;
      process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS = previousGlobalRateLimitWindow;
    });

    it('returns 429 on write when the tenant actor exceeds the rate limit and records a RATE_LIMIT_EXCEEDED event', async () => {
      const login = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.66.0.20')
        .send({ username: authUsername, password: authPassword })
        .expect(200);

      const loginUserId = login.body.user.userId;

      const firstResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('X-Forwarded-For', '10.66.0.20')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: 'admin', payload: { action: 'RATE_LIMIT_TEST' } });

      expect(firstResponse.status).toBeGreaterThanOrEqual(200);
      expect(firstResponse.status).toBeLessThan(300);

      const secondResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('X-Forwarded-For', '10.66.0.20')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: 'admin', payload: { action: 'RATE_LIMIT_TEST' } });

      expect(secondResponse.status).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = await rateLimitDataSource.query(
        `SELECT payload->>'action' AS action FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.RATE_LIMIT_EXCEEDED}' ORDER BY created_at DESC LIMIT 1`,
        [loginUserId],
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].action).toBe(AuthLedgerEventAction.RATE_LIMIT_EXCEEDED);
    });

    it('allows additional writes when the endpoint overrides the default rate limit', async () => {
      const login = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.66.0.21')
        .send({ username: authUsername, password: authPassword })
        .expect(200);

      const firstResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events/append-override')
        .set('X-Forwarded-For', '10.66.0.21')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: 'admin', payload: { action: 'RATE_LIMIT_OVERRIDE_TEST' } });

      expect(firstResponse.status).toBeGreaterThanOrEqual(200);
      expect(firstResponse.status).toBeLessThan(300);

      const secondResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events/append-override')
        .set('X-Forwarded-For', '10.66.0.21')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: 'admin', payload: { action: 'RATE_LIMIT_OVERRIDE_TEST' } });

      expect(secondResponse.status).toBeGreaterThanOrEqual(200);
      expect(secondResponse.status).toBeLessThan(300);

      const thirdResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events/append-override')
        .set('X-Forwarded-For', '10.66.0.21')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: 'admin', payload: { action: 'RATE_LIMIT_OVERRIDE_TEST' } });

      expect(thirdResponse.status).toBe(429);
    });

    it('allows writes again after the rate limit window resets', async () => {
      const login = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.66.0.22')
        .send({ username: authUsername, password: authPassword })
        .expect(200);

      const serviceTokenResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/service-token')
        .set('X-Forwarded-For', '10.66.0.22')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ name: 'rate-limit-reset-service', permissions: ['ledger.read', 'ledger.write'] })
        .expect(201);

      const firstResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('X-Forwarded-For', '10.66.0.22')
        .set('Authorization', `Bearer ${serviceTokenResponse.body.token}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: serviceTokenResponse.body.id, payload: { action: 'RATE_LIMIT_RESET_TEST' } });

      expect(firstResponse.status).toBeGreaterThanOrEqual(200);
      expect(firstResponse.status).toBeLessThan(300);

      const secondResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('X-Forwarded-For', '10.66.0.22')
        .set('Authorization', `Bearer ${serviceTokenResponse.body.token}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: serviceTokenResponse.body.id, payload: { action: 'RATE_LIMIT_RESET_TEST' } });

      expect(secondResponse.status).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const thirdResponse = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('X-Forwarded-For', '10.66.0.22')
        .set('Authorization', `Bearer ${serviceTokenResponse.body.token}`)
        .send({ type: 'LEDGER_EVENT', subjectType: 'auth', subjectId: serviceTokenResponse.body.id, payload: { action: 'RATE_LIMIT_RESET_TEST' } });

      expect(thirdResponse.status).toBeGreaterThanOrEqual(200);
      expect(thirdResponse.status).toBeLessThan(300);
    });

    it('enforces rate limits on the public refresh endpoint', async () => {
      for (let i = 0; i < 3; i += 1) {
        const response = await request(rateLimitApp.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('X-Forwarded-For', '10.66.0.23')
          .send({ refreshToken: 'invalid-token' });

        expect([400, 401]).toContain(response.status);
      }

      const blocked = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', '10.66.0.23')
        .send({ refreshToken: 'invalid-token' });

      expect(blocked.status).toBe(429);
    });

    it('enforces rate limits on the public logout endpoint', async () => {
      for (let i = 0; i < 3; i += 1) {
        const response = await request(rateLimitApp.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('X-Forwarded-For', '10.66.0.24')
          .set('Authorization', 'Bearer invalid-token')
          .send({ refreshToken: 'invalid-token' });

        expect([400, 401]).toContain(response.status);
      }

      const blocked = await request(rateLimitApp.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('X-Forwarded-For', '10.66.0.24')
        .set('Authorization', 'Bearer invalid-token')
        .send({ refreshToken: 'invalid-token' });

      expect(blocked.status).toBe(429);
    });
  });

  it('logs out and invalidates the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'auth-integration-suite')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('User-Agent', 'auth-integration-suite')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    await new Promise((resolve) => setTimeout(resolve, 100));

      const logoutEvents = await dataSource.query(
        `SELECT payload->>'action' AS action, actor_type, actor_id, source_ip, user_agent, result FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = '${AuthLedgerEventAction.LOGOUT}' ORDER BY created_at DESC LIMIT 1`,
        [login.body.user.userId],
      );

      expect(logoutEvents).toHaveLength(1);
      expect(logoutEvents[0].action).toBe(AuthLedgerEventAction.LOGOUT);
      expect(logoutEvents[0].actor_type).toBe('user');
      expect(logoutEvents[0].actor_id).toBe(login.body.user.userId);
      expect(logoutEvents[0].source_ip).toBeTruthy();
      expect(logoutEvents[0].user_agent).toContain('auth-integration-suite');
      expect(logoutEvents[0].result).toBe('accepted');
  });

  it('requires a valid bearer token on logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('rejects blacklisted access token after logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: authUsername, password: authPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/ledger/events')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });
});
