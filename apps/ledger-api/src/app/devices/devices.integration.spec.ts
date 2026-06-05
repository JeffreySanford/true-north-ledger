import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { DEVICE_BATCH_PAYLOAD_MAX_BYTES, DEVICE_EVENT_PAYLOAD_MAX_BYTES } from '@true-north-ledger/device-contracts';
import { AppModule } from '../app.module';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { LedgerEventsService } from '../ledger-events/ledger-events.service';

const tenantId = '00000000-0000-0000-0000-000000000000';

describe('DevicesController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rateLimitGuard: RateLimitGuard;
  let ledgerEventsService: LedgerEventsService;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
    process.env.AUTH_USERNAME = process.env.AUTH_USERNAME ?? 'admin';
    process.env.AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? 'admin';
    process.env.AUTH_TENANT_ID = process.env.AUTH_TENANT_ID ?? tenantId;
    process.env.JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION ?? '1d';
    process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = '1000';
    process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    rateLimitGuard = app.get<RateLimitGuard>(RateLimitGuard);
    ledgerEventsService = app.get<LedgerEventsService>(LedgerEventsService);
    await dataSource.query('TRUNCATE TABLE ledger_events, device_nonces, devices CASCADE');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
  });

  beforeEach(() => {
    rateLimitGuard.reset();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers, lists, heartbeats, and revokes a device with audit events', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'devices-integration-suite')
      .send({
        name: 'Integration scanner',
        type: 'scanner',
        metadata: { dock: 'north' },
      })
      .expect(201);

    expect(registration.body).toMatchObject({
      name: 'Integration scanner',
      type: 'scanner',
      tenantId,
      status: 'active',
      online: false,
    });
    expect(registration.body.apiKey).toMatch(/^tnl_dev_/);
    expect(registration.body.provisioningUri).toContain('tnl-device://provision?payload=');
    expect(registration.body.provisioningPayload).toMatchObject({
      version: 1,
      deviceId: registration.body.id,
      deviceName: 'Integration scanner',
      deviceType: 'scanner',
      tenantId,
      apiKey: registration.body.apiKey,
      heartbeatPath: '/api/v1/devices/heartbeat',
      deviceEventPath: '/api/v1/device-events',
      batchDeviceEventPath: '/api/v1/device-events/batch',
    });

    const persisted = await dataSource.query(
      'SELECT api_key_hash, provisioning_payload_version, last_provisioned_at FROM devices WHERE id = $1',
      [registration.body.id],
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0].api_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted[0].api_key_hash).not.toBe(registration.body.apiKey);
    expect(persisted[0].provisioning_payload_version).toBe(1);
    expect(persisted[0].last_provisioned_at).toBeTruthy();

    const list = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body.devices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: registration.body.id, name: 'Integration scanner' })]),
    );

    const heartbeat = await request(app.getHttpServer())
      .post('/api/v1/devices/heartbeat')
      .set('X-Device-Key', registration.body.apiKey)
      .send({ status: 'online', metrics: { battery: 92 } })
      .expect(200);

    expect(heartbeat.body).toMatchObject({
      deviceId: registration.body.id,
      status: 'active',
    });

    await request(app.getHttpServer())
      .post('/api/v1/devices/heartbeat')
      .set('X-Device-Key', registration.body.apiKey)
      .send({ status: 'online' })
      .expect(429);

    const ingested = await request(app.getHttpServer())
      .post('/api/v1/device-events')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        eventType: 'SCAN_RECEIVED',
        nonce: 'integration-single-1',
        payload: { sku: 'SKU-100', quantity: 2 },
      })
      .expect(201);

    expect(ingested.body).toMatchObject({
      eventId: expect.any(String),
      serverTimestamp: expect.any(String),
      nonce: 'integration-single-1',
    });

    const duplicateNonce = await request(app.getHttpServer())
      .post('/api/v1/device-events')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        eventType: 'SCAN_RECEIVED',
        nonce: 'integration-single-1',
        payload: { sku: 'SKU-100', quantity: 2 },
      })
      .expect(409);

    expect(duplicateNonce.body).toMatchObject({
      statusCode: 409,
      message: 'Device event nonce has already been used',
    });

    const batchIngested = await request(app.getHttpServer())
      .post('/api/v1/device-events/batch')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        events: [
          { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-100', quantity: 1 } },
          { eventType: 'SCAN_CONFIRMED', nonce: 'integration-batch-1', payload: { sku: 'SKU-100', accepted: true } },
        ],
      })
      .expect(201);

    expect(batchIngested.body.results).toHaveLength(2);
    expect(batchIngested.body.results).toEqual([
      expect.objectContaining({ index: 0, success: true, eventId: expect.any(String) }),
      expect.objectContaining({ index: 1, success: true, eventId: expect.any(String), nonce: 'integration-batch-1' }),
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/device-events')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        eventType: 'SCAN_OVERSIZED',
        payload: { blob: 'x'.repeat(DEVICE_EVENT_PAYLOAD_MAX_BYTES + 1) },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/device-events/batch')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        events: Array.from({ length: 5 }, (_, index) => ({
          eventType: `BATCH_SIZE_${index}`,
          payload: { blob: 'x'.repeat(Math.ceil(DEVICE_BATCH_PAYLOAD_MAX_BYTES / 5)) },
        })),
      })
      .expect(400);

    const nonceRows = await dataSource.query(
      `SELECT nonce_value FROM device_nonces WHERE device_id = $1 ORDER BY nonce_value ASC`,
      [registration.body.id],
    );
    expect(nonceRows.map((row: { nonce_value: string }) => row.nonce_value)).toEqual([
      'integration-batch-1',
      'integration-single-1',
    ]);

    await request(app.getHttpServer()).post('/api/v1/devices/heartbeat').send({}).expect(401);

    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${registration.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/devices/heartbeat')
      .set('X-Device-Key', registration.body.apiKey)
      .send({})
      .expect(401);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const auditEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'reason' AS reason FROM ledger_events WHERE subject_id = $1 ORDER BY created_at ASC`,
      [registration.body.id],
    );

    expect(auditEvents.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        'DEVICE_REGISTERED',
        'DEVICE_AUTH_SUCCESS',
        'DEVICE_HEARTBEAT',
        'DEVICE_REVOKED',
        'DEVICE_AUTH_FAILED',
        'REPLAY_ATTACK_DETECTED',
      ]),
    );
    expect(
      auditEvents.some((event: { action: string; reason: string | null }) =>
        event.action === 'DEVICE_AUTH_FAILED' && event.reason === 'device_status_revoked',
      ),
    ).toBe(true);

    const deviceEventRow = await dataSource.query(
      `SELECT actor_type, actor_id, device_id, device_type, payload->>'action' AS action, payload->>'eventType' AS event_type
       FROM ledger_events WHERE id = $1`,
      [ingested.body.eventId],
    );
    expect(deviceEventRow).toHaveLength(1);
    expect(deviceEventRow[0]).toMatchObject({
      actor_type: 'device',
      actor_id: registration.body.id,
      device_id: registration.body.id,
      device_type: 'scanner',
      action: 'DEVICE_EVENT_RECEIVED',
      event_type: 'SCAN_RECEIVED',
    });

    const batchRows = await dataSource.query(
      `SELECT payload->>'eventType' AS event_type FROM ledger_events WHERE id = ANY($1::uuid[]) ORDER BY payload->>'eventType' ASC`,
      [batchIngested.body.results.map((result: { eventId: string }) => result.eventId)],
    );
    expect(batchRows).toHaveLength(2);
    expect(batchRows.map((row: { event_type: string }) => row.event_type)).toEqual([
      'SCAN_CONFIRMED',
      'SCAN_RECEIVED',
    ]);
  });

  it('rolls back all batch device events when a mid-batch append fails', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Rollback scanner',
        type: 'scanner',
        metadata: { dock: 'rollback-lane' },
      })
      .expect(201);

    const originalAppendEvent = ledgerEventsService.appendEvent.bind(ledgerEventsService);
    let deviceEventAppends = 0;
    const appendSpy = jest.spyOn(ledgerEventsService, 'appendEvent').mockImplementation((...args) => {
      const payload = args[0] as { payload?: { action?: string } };
      if (payload?.payload?.action === 'DEVICE_EVENT_RECEIVED') {
        deviceEventAppends += 1;
        if (deviceEventAppends === 2) {
          return throwError(() => new Error('forced mid-batch failure'));
        }
      }

      return originalAppendEvent(...args);
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/device-events/batch')
        .set('X-Device-Key', registration.body.apiKey)
        .send({
          events: [
            { eventType: 'ROLLBACK_EVT_1', payload: { seq: 1 } },
            { eventType: 'ROLLBACK_EVT_2', payload: { seq: 2 } },
          ],
        })
        .expect(201);

      expect(response.body.results).toEqual([
        expect.objectContaining({
          index: 0,
          success: false,
          error: expect.stringContaining('Rolled back due to batch failure at index 1'),
        }),
        expect.objectContaining({
          index: 1,
          success: false,
          error: expect.stringContaining('forced mid-batch failure'),
        }),
      ]);

      const persistedBatchRows = await dataSource.query(
        `SELECT id FROM ledger_events
         WHERE subject_id = $1
           AND payload->>'action' = 'DEVICE_EVENT_RECEIVED'
           AND payload->>'eventType' = ANY($2::text[])`,
        [registration.body.id, ['ROLLBACK_EVT_1', 'ROLLBACK_EVT_2']],
      );

      expect(persistedBatchRows).toHaveLength(0);
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('tracks degraded heartbeat failures and auto-suspends a device at threshold', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Degraded heartbeat scanner',
        type: 'scanner',
        metadata: { dock: 'maintenance' },
      })
      .expect(201);

    for (const expectedFailureCount of [1, 2, 3]) {
      rateLimitGuard.reset();
      const heartbeat = await request(app.getHttpServer())
        .post('/api/v1/devices/heartbeat')
        .set('X-Device-Key', registration.body.apiKey)
        .send({ status: 'degraded', metrics: { battery: 10 - expectedFailureCount } })
        .expect(200);

      expect(heartbeat.body).toMatchObject({
        deviceId: registration.body.id,
        status: expectedFailureCount === 3 ? 'suspended' : 'active',
      });
    }

    const status = await request(app.getHttpServer())
      .get(`/api/v1/devices/${registration.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body).toMatchObject({
      status: 'suspended',
      heartbeatFailureCount: 3,
      online: false,
    });
    expect(status.body.autoSuspendedAt).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/devices/heartbeat')
      .set('X-Device-Key', registration.body.apiKey)
      .send({ status: 'online' })
      .expect(401);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const auditEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'heartbeatFailureCount' AS heartbeat_failure_count
       FROM ledger_events WHERE subject_id = $1 ORDER BY created_at ASC`,
      [registration.body.id],
    );

    expect(auditEvents.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(['DEVICE_HEARTBEAT', 'DEVICE_AUTO_SUSPENDED', 'DEVICE_AUTH_FAILED']),
    );
    expect(
      auditEvents.some((event: { action: string; heartbeat_failure_count: string | null }) =>
        event.action === 'DEVICE_AUTO_SUSPENDED' && event.heartbeat_failure_count === '3',
      ),
    ).toBe(true);
  });

  it('paginates tenant device lists and rejects invalid page queries', async () => {
    for (const name of ['Paged scanner A', 'Paged scanner B', 'Paged scanner C']) {
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name,
          type: 'scanner',
          metadata: { pageTest: true },
        })
        .expect(201);
    }

    const pageTwo = await request(app.getHttpServer())
      .get('/api/v1/devices?page=2&pageSize=2&search=Paged')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pageTwo.body).toMatchObject({
      total: 3,
      page: 2,
      pageSize: 2,
    });
    expect(pageTwo.body.devices).toHaveLength(1);
    expect(pageTwo.body.devices[0].name).toBe('Paged scanner A');

    await request(app.getHttpServer())
      .get('/api/v1/devices?page=0&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/devices?page=1&pageSize=101')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
