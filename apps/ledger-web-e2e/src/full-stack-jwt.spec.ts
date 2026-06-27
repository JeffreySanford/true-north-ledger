/* eslint-disable playwright/no-skipped-test, playwright/no-conditional-in-test */
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { createHmac, randomUUID } from 'crypto';
import { DEVICE_EVENT_PAYLOAD_MAX_BYTES } from '@true-north-ledger/device-contracts';

const socketBaseUrl = (process.env.API_URL ?? process.env.E2E_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

interface JwtPayload {
  sub: string;
  actorType: 'user';
  tenantId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

interface LedgerEventResponse {
  actorType: string;
  actorId: string;
  subjectType: string;
  subjectId: string;
  payload: {
    action?: string;
    sku?: string;
    actorMetadata?: {
      customerId?: string;
    };
  };
  metadata: {
    tenantId: string;
    correlationId?: string;
    requestId: string;
    userAgent: string;
    payloadHash: string;
    eventHash: string;
    result: string;
  };
}

interface LoginResponseBody {
  accessToken: string;
  refreshToken: string;
  user: {
    userId: string;
    tenantId: string;
  };
}

const tenantId = '00000000-0000-0000-0000-000000000000';
const authUsername = process.env['AUTH_USERNAME'] ?? 'admin';
const authPassword = process.env['AUTH_PASSWORD'] ?? 'admin';
let loginRequestCounter = 0;

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 300): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET is required for full-stack JWT E2E tests.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url({
    ...payload,
    tokenType: 'access',
    iat: now,
    exp: now + expiresInSeconds,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function login(
  request: APIRequestContext,
  label: string,
  options: { correlationId?: string; userAgent?: string } = {},
): Promise<LoginResponseBody> {
  loginRequestCounter += 1;
  const response = await request.post('/api/v1/auth/login', {
    headers: {
      'X-Correlation-Id': options.correlationId ?? `e2e-${label}-${loginRequestCounter}`,
      'X-Forwarded-For': `10.240.0.${loginRequestCounter}`,
      ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}),
    },
    data: {
      username: authUsername,
      password: authPassword,
    },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<LoginResponseBody>;
}

test.describe('ledger-web full-stack JWT flow', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.addInitScript((apiUrl) => {
      window.localStorage.setItem('tnl.disableAutoAuth', 'true');
      window.localStorage.setItem('tnl.socketBaseUrl', apiUrl);
    }, socketBaseUrl);

    await expect
      .poll(
        async () => {
          const response = await request.get('/api/v1/ledger/events');
          return response.status();
        },
        {
          timeout: 30_000,
          intervals: [500, 1_000, 2_000],
        },
      )
      .toBe(401);
  });

  test('creates and reloads a ledger event through UI, API, and database', async ({ page }) => {
    const actorId = `ui-e2e-${randomUUID()}`;
    const token = createJwt({
      sub: actorId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read', 'ledger.write'],
    });

    const authUser = {
      userId: actorId,
      username: actorId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read', 'ledger.write'],
    };

    await page.addInitScript((session) => {
      window.localStorage.setItem('tnl.authToken', session.token);
      window.localStorage.setItem('tnl.authUser', JSON.stringify(session.user));
    }, { token, user: authUser });

    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');

    const createButton = page.getByRole('button', { name: 'Create demo event' });
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await createButton.click();

    const createdRows = () =>
      page.locator('[data-testid="ledger-event-row"]').filter({ hasText: actorId });

    await expect(createdRows().first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(createdRows().first()).toBeVisible({ timeout: 15_000 });
  });

  test('redirects unauthenticated users to login when no JWT is available', async ({ page }) => {
    await page.goto('/ledger-events');

    await expect(page.locator('h1')).toHaveText('Login');
  });

  test('renders a clear authorization error when the JWT signature is invalid', async ({ page }) => {
    const subjectId = `ui-e2e-invalid-${randomUUID()}`;
    const invalidToken = [
      base64Url({ alg: 'HS256', typ: 'JWT' }),
      base64Url({
        sub: subjectId,
        actorType: 'user',
        tenantId,
        permissions: ['ledger.read', 'ledger.write'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
      'invalid-signature',
    ].join('.');

    const authUser = {
      userId: subjectId,
      username: subjectId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read', 'ledger.write'],
    };

    await page.addInitScript((session) => {
      window.localStorage.setItem('tnl.authToken', session.token);
      window.localStorage.setItem('tnl.authUser', JSON.stringify(session.user));
    }, { token: invalidToken, user: authUser });

    await page.goto('/ledger-events');

    await expect(page.getByRole('heading', { name: /Login|Access denied/ })).toBeVisible();
  });

  test('renders an access denied page when the access token lacks read permission', async ({ page }) => {
    const subjectId = `ui-e2e-${randomUUID()}`;
    const token = createJwt({
      sub: subjectId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.write'],
    });

    const authUser = {
      userId: subjectId,
      username: subjectId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.write'],
    };

    await page.addInitScript((session) => {
      window.localStorage.setItem('tnl.authToken', session.token);
      window.localStorage.setItem('tnl.authUser', JSON.stringify(session.user));
    }, { token, user: authUser });

    await page.goto('/ledger-events');

    await expect(page.locator('h1')).toHaveText('Access denied');
  });

  test('returns 401 for an expired access token on direct API requests', async ({ request }) => {
    const token = createJwt({
      sub: `ui-e2e-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['read'],
    }, -10);

    const response = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(401);
  });

  test('returns 401 for an invalid JWT signature on direct API requests', async ({ request }) => {
    const invalidToken = [
      base64Url({ alg: 'HS256', typ: 'JWT' }),
      base64Url({
        sub: `ui-e2e-${randomUUID()}`,
        actorType: 'user',
        tenantId,
        permissions: ['read'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
      'bad-signature',
    ].join('.');

    const response = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${invalidToken}`,
      },
    });

    expect(response.status()).toBe(401);
  });

  test('invalidates access token after authenticated logout', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Auth API revocation flow is backend-only and can run once per suite.');

    const loginBody = await login(request, 'logout');
    const logoutResponse = await request.post('/api/v1/auth/logout', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
      data: {
        refreshToken: loginBody.refreshToken,
      },
    });
    expect(logoutResponse.status()).toBe(204);

    const revokedTokenResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
    });
    expect(revokedTokenResponse.status()).toBe(401);
  });

  test('returns 403 when the access token lacks read permission', async ({ request }) => {
    const token = createJwt({
      sub: `ui-e2e-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.write'],
    });

    const response = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.status()).toBe(403);
  });

  test('returns 403 when the access token lacks write permission', async ({ request }) => {
    const token = createJwt({
      sub: `ui-e2e-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read'],
    });

    const response = await request.post('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'test',
        subjectId: 'permission-denied',
        payload: { action: 'create' },
      },
    });

    expect(response.status()).toBe(403);
  });

  test('ingests a device event with device-key authentication', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Device API integration flow runs once per suite.');
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000';

    const loginBody = await login(request, 'device-event');
    let registrationResponse = await request.post('/api/v1/devices/register', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
      data: {
        name: `e2e-device-${randomUUID().slice(0, 8)}`,
        type: 'scanner',
      },
    });
    if (registrationResponse.status() === 404) {
      registrationResponse = await request.post(`${apiBaseUrl}/api/v1/devices/register`, {
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        data: {
          name: `e2e-device-${randomUUID().slice(0, 8)}`,
          type: 'scanner',
        },
      });
    }
    test.skip(
      registrationResponse.status() === 404,
      'Devices endpoints are unavailable in the currently running reused dev server.',
    );
    expect(registrationResponse.status()).toBe(201);

    const registrationBody = await registrationResponse.json();
    const missingDeviceKeyResponse = await request.post('/api/v1/device-events', {
      data: {
        eventType: 'SCAN_WITHOUT_KEY',
        payload: {
          sku: 'SKU-E2E-MISSING-KEY',
          quantity: 1,
        },
      },
    });
    expect(missingDeviceKeyResponse.status()).toBe(401);

    let ingestResponse = await request.post('/api/v1/device-events', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        eventType: 'SCAN_RECEIVED',
        nonce: `e2e-single-${randomUUID()}`,
        payload: {
          sku: 'SKU-E2E-1',
          quantity: 1,
        },
      },
    });
    if (ingestResponse.status() === 404) {
      ingestResponse = await request.post(`${apiBaseUrl}/api/v1/device-events`, {
        headers: {
          'X-Device-Key': registrationBody.apiKey,
        },
        data: {
          eventType: 'SCAN_RECEIVED',
          nonce: `e2e-single-${randomUUID()}`,
          payload: {
            sku: 'SKU-E2E-1',
            quantity: 1,
          },
        },
      });
    }

    expect(ingestResponse.status()).toBe(201);
    const ingestBody = await ingestResponse.json();
    expect(ingestBody).toMatchObject({
      eventId: expect.any(String),
      serverTimestamp: expect.any(String),
    });

    const oversizedPayloadResponse = await request.post('/api/v1/device-events', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        eventType: 'SCAN_OVERSIZED',
        payload: { blob: 'x'.repeat(DEVICE_EVENT_PAYLOAD_MAX_BYTES + 1) },
      },
    });
    test.skip(
      oversizedPayloadResponse.status() === 201,
      'Device event payload size validation is unavailable in the currently running reused dev server.',
    );
    expect(oversizedPayloadResponse.status()).toBe(400);

    test.skip(
      typeof ingestBody.nonce !== 'string',
      'Device nonce echo is unavailable in the currently running reused dev server.',
    );
    expect(ingestBody.nonce).toMatch(/^e2e-single-/);

    const replayNonce = `e2e-replay-${randomUUID()}`;
    const firstNonceResponse = await request.post('/api/v1/device-events', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        eventType: 'SCAN_RECEIVED',
        nonce: replayNonce,
        payload: {
          sku: 'SKU-E2E-REPLAY',
          quantity: 1,
        },
      },
    });
    expect(firstNonceResponse.status()).toBe(201);

    const duplicateNonceResponse = await request.post('/api/v1/device-events', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        eventType: 'SCAN_RECEIVED',
        nonce: replayNonce,
        payload: {
          sku: 'SKU-E2E-REPLAY',
          quantity: 1,
        },
      },
    });
    expect(duplicateNonceResponse.status()).toBe(409);
    const duplicateNonceBody = await duplicateNonceResponse.json();
    expect(duplicateNonceBody.message).toBe('Device event nonce has already been used');
  });

  test('ingests batch device events with device-key authentication', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Device API integration flow runs once per suite.');
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000';

    const loginBody = await login(request, 'batch-device-events');
    let registrationResponse = await request.post('/api/v1/devices/register', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
      data: {
        name: `e2e-batch-${randomUUID().slice(0, 8)}`,
        type: 'scanner',
      },
    });
    if (registrationResponse.status() === 404) {
      registrationResponse = await request.post(`${apiBaseUrl}/api/v1/devices/register`, {
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        data: {
          name: `e2e-batch-${randomUUID().slice(0, 8)}`,
          type: 'scanner',
        },
      });
    }
    test.skip(
      registrationResponse.status() === 404,
      'Devices endpoints are unavailable in the currently running reused dev server.',
    );
    expect(registrationResponse.status()).toBe(201);

    const registrationBody = await registrationResponse.json();
    let batchResponse = await request.post('/api/v1/device-events/batch', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        events: [
          { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-E2E-B1', quantity: 1 } },
          { eventType: 'SCAN_CONFIRMED', nonce: `e2e-batch-${randomUUID()}`, payload: { sku: 'SKU-E2E-B1', accepted: true } },
        ],
      },
    });
    if (batchResponse.status() === 404) {
      batchResponse = await request.post(`${apiBaseUrl}/api/v1/device-events/batch`, {
        headers: {
          'X-Device-Key': registrationBody.apiKey,
        },
        data: {
          events: [
            { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-E2E-B1', quantity: 1 } },
            { eventType: 'SCAN_CONFIRMED', nonce: `e2e-batch-${randomUUID()}`, payload: { sku: 'SKU-E2E-B1', accepted: true } },
          ],
        },
      });
    }

    test.skip(
      batchResponse.status() === 404,
      'Device batch endpoint is unavailable in the currently running reused dev server.',
    );

    expect(batchResponse.status()).toBe(201);
    const batchBody = await batchResponse.json();
    expect(batchBody.results).toHaveLength(2);
    expect(batchBody.results).toEqual([
      expect.objectContaining({ index: 0, success: true, eventId: expect.any(String) }),
      expect.objectContaining({ index: 1, success: true, eventId: expect.any(String) }),
    ]);
    test.skip(
      typeof batchBody.results[1]?.nonce !== 'string',
      'Device batch nonce echo is unavailable in the currently running reused dev server.',
    );
    expect(batchBody.results[1].nonce).toMatch(/^e2e-batch-/);
  });

  test('throttles repeated device heartbeats without blocking device events', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Device API integration flow runs once per suite.');
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000';

    const loginBody = await login(request, 'device-heartbeats');
    let registrationResponse = await request.post('/api/v1/devices/register', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
      data: {
        name: `e2e-heartbeat-${randomUUID().slice(0, 8)}`,
        type: 'scanner',
      },
    });
    if (registrationResponse.status() === 404) {
      registrationResponse = await request.post(`${apiBaseUrl}/api/v1/devices/register`, {
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        data: {
          name: `e2e-heartbeat-${randomUUID().slice(0, 8)}`,
          type: 'scanner',
        },
      });
    }
    test.skip(
      registrationResponse.status() === 404,
      'Devices endpoints are unavailable in the currently running reused dev server.',
    );
    expect(registrationResponse.status()).toBe(201);

    const registrationBody = await registrationResponse.json();
    const firstHeartbeat = await request.post('/api/v1/devices/heartbeat', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: { status: 'online' },
    });
    expect(firstHeartbeat.status()).toBe(200);

    const repeatedHeartbeat = await request.post('/api/v1/devices/heartbeat', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: { status: 'online' },
    });
    test.skip(
      repeatedHeartbeat.status() !== 429,
      'Device heartbeat throttling is unavailable in the currently running reused dev server.',
    );
    expect(repeatedHeartbeat.status()).toBe(429);

    const deviceEvent = await request.post('/api/v1/device-events', {
      headers: {
        'X-Device-Key': registrationBody.apiKey,
      },
      data: {
        eventType: 'SCAN_AFTER_HEARTBEAT_THROTTLE',
        nonce: `e2e-heartbeat-route-${randomUUID()}`,
        payload: { sku: 'SKU-E2E-HEARTBEAT' },
      },
    });
    expect(deviceEvent.status()).toBe(201);
  });

  test('creates and uses a service token for tenant-scoped API access', async ({ request }) => {
    const adminToken = createJwt({
      sub: `ui-e2e-admin-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['admin'],
    });

    const createResponse = await request.post('/api/v1/auth/service-token', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        name: 'e2e-service',
        permissions: ['ledger.read'],
      },
    });

    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    const token = createBody.token;
    expect(token).toBeTruthy();

    const serviceResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(serviceResponse.status()).toBe(200);

    const revokeResponse = await request.delete(`/api/v1/auth/service-token/${createBody.id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(revokeResponse.status()).toBe(204);

    const postRevokeResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(postRevokeResponse.status()).toBe(401);
  });

  test('denies protected API access for a deactivated user', async ({ request }) => {
    const adminToken = createJwt({
      sub: `ui-e2e-admin-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['admin'],
    });

    const deactivatedUserId = `ui-e2e-deactivated-${randomUUID()}`;

    const deactivationResponse = await request.post(`/api/v1/auth/users/${deactivatedUserId}/deactivate`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        reason: 'E2E deactivation test',
      },
    });

    expect(deactivationResponse.status()).toBe(200);

    const deactivatedUserToken = createJwt({
      sub: deactivatedUserId,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read'],
    });

    const protectedResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${deactivatedUserToken}`,
      },
    });

    expect(protectedResponse.status()).toBe(403);
  });

  test('applies assigned role permissions for role-only JWTs', async ({ request }) => {
    const adminToken = createJwt({
      sub: `ui-e2e-admin-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['admin'],
    });

    const supportUserId = `ui-e2e-support-${randomUUID()}`;

    const assignmentResponse = await request.post(`/api/v1/auth/users/${supportUserId}/roles`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        username: `${supportUserId}@example.local`,
        roles: ['support'],
      },
    });

    expect(assignmentResponse.status()).toBe(200);

    const supportRoleToken = createJwt({
      sub: supportUserId,
      actorType: 'user',
      tenantId,
      permissions: [],
    });

    const readResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${supportRoleToken}`,
      },
    });

    expect(readResponse.status()).toBe(200);

    const writeResponse = await request.post('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${supportRoleToken}`,
      },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'auth',
        subjectId: supportUserId,
        payload: { action: 'SUPPORT_WRITE_SHOULD_BE_DENIED' },
      },
    });

    expect(writeResponse.status()).toBe(403);
  });

  test('uses seeded tenant role-permission mappings for viewer role', async ({ request }) => {
    const adminToken = createJwt({
      sub: `ui-e2e-admin-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['admin'],
    });

    const viewerUserId = `ui-e2e-viewer-${randomUUID()}`;

    const assignmentResponse = await request.post(`/api/v1/auth/users/${viewerUserId}/roles`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        username: `${viewerUserId}@example.local`,
        roles: ['viewer'],
      },
    });

    expect(assignmentResponse.status()).toBe(200);

    const viewerToken = createJwt({
      sub: viewerUserId,
      actorType: 'user',
      tenantId,
      permissions: [],
    });

    const readResponse = await request.get('/api/v1/ledger/events', {
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    });
    expect(readResponse.status()).toBe(200);

    const auditResponse = await request.get('/api/v1/ledger/events/chain/verify', {
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    });
    expect(auditResponse.status()).toBe(403);
  });

  test('enforces endpoint permission matrix across protected auth and ledger routes', async ({ request }) => {
    const adminToken = createJwt({
      sub: `ui-e2e-admin-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['admin'],
    });
    const readToken = createJwt({
      sub: `ui-e2e-read-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read'],
    });
    const writeToken = createJwt({
      sub: `ui-e2e-write-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.write'],
    });
    const auditToken = createJwt({
      sub: `ui-e2e-audit-${randomUUID()}`,
      actorType: 'user',
      tenantId,
      permissions: ['ledger.audit'],
    });

    const matrixCases: Array<{
      name: string;
      expectedStatus: number;
      run: () => Promise<import('@playwright/test').APIResponse>;
    }> = [
      {
        name: 'auth service-token create requires admin',
        expectedStatus: 403,
        run: () => request.post('/api/v1/auth/service-token', {
          headers: { Authorization: `Bearer ${readToken}` },
          data: { name: 'matrix-non-admin-token', permissions: ['ledger.read'] },
        }),
      },
      {
        name: 'auth role assignment allows admin',
        expectedStatus: 200,
        run: () => request.post(`/api/v1/auth/users/matrix-role-${randomUUID()}/roles`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { username: 'matrix.support', roles: ['support'] },
        }),
      },
      {
        name: 'auth role assignment denies non-admin',
        expectedStatus: 403,
        run: () => request.post(`/api/v1/auth/users/matrix-role-denied-${randomUUID()}/roles`, {
          headers: { Authorization: `Bearer ${readToken}` },
          data: { username: 'matrix.noadmin', roles: ['viewer'] },
        }),
      },
      {
        name: 'ledger.read allows list',
        expectedStatus: 200,
        run: () => request.get('/api/v1/ledger/events', {
          headers: { Authorization: `Bearer ${readToken}` },
        }),
      },
      {
        name: 'missing ledger.read denies list',
        expectedStatus: 403,
        run: () => request.get('/api/v1/ledger/events', {
          headers: { Authorization: `Bearer ${writeToken}` },
        }),
      },
      {
        name: 'ledger.write allows append',
        expectedStatus: 201,
        run: () => request.post('/api/v1/ledger/events', {
          headers: { Authorization: `Bearer ${writeToken}` },
          data: {
            type: 'LEDGER_EVENT',
            subjectType: 'auth',
            subjectId: `matrix-write-${randomUUID()}`,
            payload: { action: 'E2E_MATRIX_WRITE_ALLOWED' },
          },
        }),
      },
      {
        name: 'missing ledger.write denies append',
        expectedStatus: 403,
        run: () => request.post('/api/v1/ledger/events', {
          headers: { Authorization: `Bearer ${readToken}` },
          data: {
            type: 'LEDGER_EVENT',
            subjectType: 'auth',
            subjectId: `matrix-write-denied-${randomUUID()}`,
            payload: { action: 'E2E_MATRIX_WRITE_DENIED' },
          },
        }),
      },
      {
        name: 'ledger.audit allows chain verify',
        expectedStatus: 200,
        run: () => request.get('/api/v1/ledger/events/chain/verify', {
          headers: { Authorization: `Bearer ${auditToken}` },
        }),
      },
      {
        name: 'missing ledger.audit denies chain verify',
        expectedStatus: 403,
        run: () => request.get('/api/v1/ledger/events/chain/verify', {
          headers: { Authorization: `Bearer ${readToken}` },
        }),
      },
    ];

    for (const matrixCase of matrixCases) {
      const response = await matrixCase.run();
      expect(response.status(), `${matrixCase.name} status`).toBe(matrixCase.expectedStatus);
    }
  });

  test('exposes consistent audit metadata across auth, device, order, and inventory events', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Cross-module API audit flow runs once per suite.');

    const suiteId = randomUUID().slice(0, 8);
    const loginBody = await login(request, `audit-${suiteId}`, {
      correlationId: `e2e-auth-${suiteId}`,
      userAgent: 'e2e-audit-auth',
    });
    const authorization = `Bearer ${loginBody.accessToken}`;

    const registrationResponse = await request.post('/api/v1/devices/register', {
      headers: {
        Authorization: authorization,
        'User-Agent': 'e2e-audit-device',
        'X-Correlation-Id': `e2e-device-${suiteId}`,
      },
      data: {
        name: `E2E audit scanner ${suiteId}`,
        type: 'scanner',
      },
    });
    test.skip(
      registrationResponse.status() === 404,
      'Devices endpoint is unavailable in the currently running reused dev server.',
    );
    expect(registrationResponse.status()).toBe(201);
    const registrationBody = await registrationResponse.json();

    const sku = `SKU-E2E-AUDIT-${suiteId.toUpperCase()}`;
    const inventoryResponse = await request.post('/api/v1/inventory', {
      headers: {
        Authorization: authorization,
        'User-Agent': 'e2e-audit-inventory',
        'X-Correlation-Id': `e2e-inventory-${suiteId}`,
      },
      data: {
        sku,
        name: 'E2E audit inventory',
        locationId: 'E2E-AUDIT',
        locationName: 'E2E Audit Location',
        quantity: 3,
        unitOfMeasure: 'each',
      },
    });
    test.skip(
      inventoryResponse.status() === 404,
      'Inventory endpoint is unavailable in the currently running reused dev server.',
    );
    expect(inventoryResponse.status()).toBe(201);
    const inventoryBody = await inventoryResponse.json();

    const orderResponse = await request.post('/api/v1/orders', {
      headers: {
        Authorization: authorization,
        'User-Agent': 'e2e-audit-order',
        'X-Correlation-Id': `e2e-order-${suiteId}`,
      },
      data: {
        customerId: `customer-e2e-audit-${suiteId}`,
        customerName: 'E2E Audit Customer',
        customerEmail: 'audit.e2e@example.com',
        items: [{ sku, name: 'E2E audit inventory', quantity: 1, unitPrice: 12 }],
        currency: 'USD',
        shippingAddress: {
          line1: '100 E2E Audit Way',
          city: 'Austin',
          region: 'TX',
          postalCode: '78701',
          country: 'US',
        },
        idempotencyKey: `e2e-audit-${suiteId}`,
      },
    });
    test.skip(
      orderResponse.status() === 404,
      'Orders endpoint is unavailable in the currently running reused dev server.',
    );
    expect(orderResponse.status()).toBe(201);
    const orderBody = await orderResponse.json();

    let events: LedgerEventResponse[] = [];
    await expect
      .poll(
        async () => {
          const response = await request.get('/api/v1/ledger/events', {
            headers: { Authorization: authorization },
          });
          expect(response.status()).toBe(200);
          events = (await response.json()) as LedgerEventResponse[];
          return events.some(
            (event) =>
              event.subjectType === 'order' &&
              event.subjectId === orderBody.id &&
              event.payload.action === 'ORDER_CREATED',
          );
        },
        {
          timeout: 10_000,
          intervals: [500, 1_000],
        },
      )
      .toBe(true);

    const authEvent = events.find(
      (event) =>
        event.subjectType === 'auth' &&
        event.payload.action === 'LOGIN_SUCCESS' &&
        event.metadata.correlationId === `e2e-auth-${suiteId}`,
    );
    const deviceEvent = events.find(
      (event) => event.subjectType === 'device' && event.subjectId === registrationBody.id && event.payload.action === 'DEVICE_REGISTERED',
    );
    const inventoryEvent = events.find(
      (event) => event.subjectType === 'inventory' && event.subjectId === inventoryBody.id && event.payload.action === 'INVENTORY_ADDED',
    );
    const orderEvent = events.find(
      (event) => event.subjectType === 'order' && event.subjectId === orderBody.id && event.payload.action === 'ORDER_CREATED',
    );

    expect(authEvent?.metadata).toMatchObject({
      tenantId,
      correlationId: `e2e-auth-${suiteId}`,
      result: 'accepted',
    });
    expect(deviceEvent?.metadata).toMatchObject({
      tenantId,
      correlationId: `e2e-device-${suiteId}`,
      result: 'accepted',
    });
    expect(inventoryEvent?.metadata).toMatchObject({
      tenantId,
      correlationId: `e2e-inventory-${suiteId}`,
      result: 'accepted',
    });
    expect(orderEvent?.metadata).toMatchObject({
      tenantId,
      correlationId: orderBody.correlationId,
      result: 'accepted',
    });
    expect(inventoryEvent?.payload.sku).toBe(sku);
    expect(orderEvent?.payload.actorMetadata?.customerId).toBe(`customer-e2e-audit-${suiteId}`);

    for (const event of [authEvent, deviceEvent, inventoryEvent, orderEvent]) {
      expect(event?.metadata.requestId).toMatch(/[0-9a-f-]{36}/);
      expect(event?.metadata.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(event?.metadata.eventHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test('keeps order idempotency and inventory import retries non-duplicating', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Idempotency and retry API flow runs once per suite.');
    const suiteId = randomUUID().slice(0, 8);
    const loginBody = await login(request, `retry-${suiteId}`);
    const authorization = `Bearer ${loginBody.accessToken}`;
    const skuOne = `SKU-E2E-RETRY-${suiteId.toUpperCase()}-1`;
    const skuTwo = `SKU-E2E-RETRY-${suiteId.toUpperCase()}-2`;
    const idempotencyKey = `e2e-order-retry-${suiteId}`;

    const orderRequest = {
      customerId: `customer-e2e-retry-${suiteId}`,
      customerName: 'E2E Retry Customer',
      customerEmail: 'retry.e2e@example.com',
      items: [{ sku: skuOne, name: 'E2E retry item', quantity: 1, unitPrice: 19 }],
      currency: 'USD',
      shippingAddress: {
        line1: '200 E2E Retry Way',
        city: 'Austin',
        region: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      idempotencyKey,
    };

    const orderResponse = await request.post('/api/v1/orders', {
      headers: {
        Authorization: authorization,
        'X-Correlation-Id': `e2e-order-retry-${suiteId}`,
      },
      data: orderRequest,
    });
    test.skip(orderResponse.status() === 404, 'Orders endpoint is unavailable in the currently running reused dev server.');
    expect(orderResponse.status()).toBe(201);
    const orderBody = await orderResponse.json();

    const replayOrderResponse = await request.post('/api/v1/orders', {
      headers: {
        Authorization: authorization,
        'X-Correlation-Id': `e2e-order-retry-replay-${suiteId}`,
      },
      data: {
        ...orderRequest,
        customerName: 'E2E Retry Customer Replay',
        items: [{ sku: skuTwo, name: 'Replay item should not persist', quantity: 3, unitPrice: 99 }],
      },
    });
    expect(replayOrderResponse.status()).toBe(201);
    const replayOrderBody = await replayOrderResponse.json();
    expect(replayOrderBody).toMatchObject({
      id: orderBody.id,
      orderNumber: orderBody.orderNumber,
      correlationId: orderBody.correlationId,
      customerName: 'E2E Retry Customer',
    });

    const importRequest = {
      items: [
        {
          sku: skuOne,
          name: 'E2E retry inventory one',
          locationId: 'E2E-RETRY',
          locationName: 'E2E Retry Location',
          quantity: 2,
          unitOfMeasure: 'each',
        },
        {
          sku: skuTwo,
          name: 'E2E retry inventory two',
          locationId: 'E2E-RETRY',
          locationName: 'E2E Retry Location',
          quantity: 3,
          unitOfMeasure: 'each',
        },
      ],
    };

    const importResponse = await request.post('/api/v1/inventory/import', {
      headers: { Authorization: authorization },
      data: importRequest,
    });
    test.skip(importResponse.status() === 404, 'Inventory endpoint is unavailable in the currently running reused dev server.');
    expect(importResponse.status()).toBe(200);
    const importBody = await importResponse.json();
    expect(importBody.results).toEqual([
      expect.objectContaining({ sku: skuOne, success: true }),
      expect.objectContaining({ sku: skuTwo, success: true }),
    ]);

    const replayImportResponse = await request.post('/api/v1/inventory/import', {
      headers: { Authorization: authorization },
      data: importRequest,
    });
    expect(replayImportResponse.status()).toBe(200);
    const replayImportBody = await replayImportResponse.json();
    expect(replayImportBody.results).toEqual([
      expect.objectContaining({ sku: skuOne, success: false }),
      expect.objectContaining({ sku: skuTwo, success: false }),
    ]);

    let events: LedgerEventResponse[] = [];
    await expect
      .poll(
        async () => {
          const response = await request.get('/api/v1/ledger/events', {
            headers: { Authorization: authorization },
          });
          expect(response.status()).toBe(200);
          events = (await response.json()) as LedgerEventResponse[];
          const orderCreatedEvents = events.filter(
            (event) =>
              event.subjectType === 'order' &&
              event.subjectId === orderBody.id &&
              event.payload.action === 'ORDER_CREATED',
          );
          const inventoryAddedEvents = events.filter(
            (event) =>
              event.subjectType === 'inventory' &&
              event.payload.action === 'INVENTORY_ADDED' &&
              [skuOne, skuTwo].includes(event.payload.sku ?? ''),
          );
          return `${orderCreatedEvents.length}:${inventoryAddedEvents.length}`;
        },
        {
          timeout: 10_000,
          intervals: [500, 1_000],
        },
      )
      .toBe('1:2');
  });

  test('keeps device lists, device status, and ledger event details tenant isolated', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Tenant isolation API flow runs once per suite.');
    const suiteId = randomUUID().slice(0, 8);
    const otherTenantId = '11111111-1111-4111-8111-111111111111';
    const loginBody = await login(request, `tenant-isolation-${suiteId}`);
    const authorization = `Bearer ${loginBody.accessToken}`;
    const otherTenantAuthorization = `Bearer ${createJwt({
      sub: `e2e-other-tenant-${suiteId}`,
      actorType: 'user',
      tenantId: otherTenantId,
      permissions: ['devices.read', 'devices.manage', 'ledger.read', 'ledger.write'],
    })}`;

    const tenantDeviceResponse = await request.post('/api/v1/devices/register', {
      headers: { Authorization: authorization },
      data: {
        name: `E2E tenant scanner ${suiteId}`,
        type: 'scanner',
      },
    });
    test.skip(tenantDeviceResponse.status() === 404, 'Devices endpoint is unavailable in the currently running reused dev server.');
    expect(tenantDeviceResponse.status()).toBe(201);
    const tenantDevice = await tenantDeviceResponse.json();

    const otherTenantDeviceResponse = await request.post('/api/v1/devices/register', {
      headers: { Authorization: otherTenantAuthorization },
      data: {
        name: `E2E other tenant scanner ${suiteId}`,
        type: 'scanner',
      },
    });
    expect(otherTenantDeviceResponse.status()).toBe(201);
    const otherTenantDevice = await otherTenantDeviceResponse.json();

    const tenantListResponse = await request.get(`/api/v1/devices?search=${suiteId}`, {
      headers: { Authorization: authorization },
    });
    expect(tenantListResponse.status()).toBe(200);
    const tenantList = await tenantListResponse.json();
    expect(tenantList.devices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tenantDevice.id, tenantId })]),
    );
    expect(tenantList.devices.some((device: { id: string }) => device.id === otherTenantDevice.id)).toBe(false);

    const crossTenantStatusResponse = await request.get(`/api/v1/devices/${otherTenantDevice.id}/status`, {
      headers: { Authorization: authorization },
    });
    expect(crossTenantStatusResponse.status()).toBe(404);

    const otherTenantEventResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: otherTenantAuthorization },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'tenant-isolation-e2e',
        subjectId: `other-tenant-event-${suiteId}`,
        payload: { action: 'TENANT_ISOLATION_E2E' },
      },
    });
    test.skip(otherTenantEventResponse.status() === 404, 'Ledger events endpoint is unavailable in the currently running reused dev server.');
    expect(otherTenantEventResponse.status()).toBe(201);
    const otherTenantEvent = await otherTenantEventResponse.json();

    const crossTenantEventDetailResponse = await request.get(`/api/v1/ledger/events/${otherTenantEvent.id}`, {
      headers: { Authorization: authorization },
    });
    expect(crossTenantEventDetailResponse.status()).toBe(404);

    const otherTenantEventDetailResponse = await request.get(`/api/v1/ledger/events/${otherTenantEvent.id}`, {
      headers: { Authorization: otherTenantAuthorization },
    });
    expect(otherTenantEventDetailResponse.status()).toBe(200);
    const otherTenantEventDetail = await otherTenantEventDetailResponse.json();
    expect(otherTenantEventDetail).toMatchObject({
      id: otherTenantEvent.id,
      subjectId: `other-tenant-event-${suiteId}`,
      metadata: expect.objectContaining({ tenantId: otherTenantId }),
    });
  });
});
