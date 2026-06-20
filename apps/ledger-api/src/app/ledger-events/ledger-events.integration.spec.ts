import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { createTestJwtToken } from '../auth/test-helpers';

interface LedgerEventListItem {
  subjectId?: string;
}

describe('LedgerEventsController (Integration)', () => {
  const suiteTenantId = '22222222-2222-4222-8222-222222222222';
  const otherTenantId = '33333333-3333-4333-8333-333333333333';
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;
  let auditorToken: string;
  let deviceToken: string;
  let differentTenantToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    await dataSource.query('TRUNCATE TABLE ledger_events CASCADE');

    authToken = createTestJwtToken({
      sub: 'ledger-suite-user',
      actorType: 'user',
      tenantId: suiteTenantId,
      permissions: ['ledger.read', 'ledger.write'],
    });
    auditorToken = createTestJwtToken({
      sub: 'ledger-suite-auditor',
      actorType: 'user',
      tenantId: suiteTenantId,
      permissions: ['ledger.read', 'ledger.audit'],
    });
    deviceToken = createTestJwtToken({
      sub: 'ledger-suite-device',
      actorType: 'device',
      tenantId: suiteTenantId,
      permissions: ['ledger.write'],
    });
    differentTenantToken = createTestJwtToken({
      sub: 'ledger-suite-other',
      actorType: 'user',
      tenantId: otherTenantId,
      permissions: ['ledger.read', 'ledger.write'],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  function appendDto(subjectId = 'subject-1') {
    return {
      type: 'LEDGER_EVENT',
      subjectType: 'test',
      subjectId,
      payload: { action: 'created' },
    };
  }

  describe('authentication and permissions', () => {
    it('requires authentication for reads', () => {
      return request(app.getHttpServer()).get('/api/v1/ledger/events').expect(401);
    });

    it('requires authentication for writes', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(appendDto())
        .expect(401);
    });

    it('requires read permission for reads', () => {
      const token = createTestJwtToken({ permissions: ['write'] });

      return request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('requires write permission for writes', () => {
      const token = createTestJwtToken({ permissions: ['read'] });

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${token}`)
        .send(appendDto())
        .expect(403);
    });

    it('requires audit permission for chain verification', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events/chain/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });

  describe('ledger events', () => {
    it('returns an empty tenant-scoped list initially', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('creates a ledger event with server-controlled metadata and chain fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'supertest')
        .set('X-Correlation-Id', 'corr-integration')
        .send(appendDto('integration-subject'))
        .expect(201)
        .expect((res) => {
          expect(res.body.type).toBe('LEDGER_EVENT');
          expect(res.body.actorType).toBe('user');
          expect(res.body.actorId).toBe('ledger-suite-user');
          expect(res.body.metadata.tenantId).toBe(suiteTenantId);
          expect(res.body.metadata.requestId).toHaveLength(36);
          expect(res.body.metadata.correlationId).toBe('corr-integration');
          expect(res.body.metadata.userAgent).toBe('supertest');
          expect(res.body.metadata.payloadHash).toHaveLength(64);
          expect(res.body.metadata.eventHash).toHaveLength(64);
          expect(res.body.metadata.chainSequence).toBeGreaterThanOrEqual(1);
          expect(res.body.metadata.result).toBe('accepted');
        });
    });

    it('links subsequent events to the previous event hash', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(appendDto('chain-1'))
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(appendDto('chain-2'))
        .expect(201);

      expect(second.body.metadata.previousHash).toBe(first.body.metadata.eventHash);
      expect(second.body.metadata.chainSequence).toBe(first.body.metadata.chainSequence + 1);
    });

    it('creates a device ledger event with device identity fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${deviceToken}`)
        .send({
          type: 'DEVICE_LEDGER_EVENT',
          subjectType: 'measurement',
          subjectId: 'reading-1',
          deviceId: 'sensor-001',
          deviceType: 'temperature-sensor',
          payload: { temperature: 22.5 },
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.type).toBe('DEVICE_LEDGER_EVENT');
          expect(res.body.deviceId).toBe('sensor-001');
          expect(res.body.deviceType).toBe('temperature-sensor');
          expect(res.body.actorType).toBe('device');
          expect(res.body.actorId).toBe('ledger-suite-device');
        });
    });

    it('verifies the tenant ledger chain for auditors', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(appendDto('audit-seed'))
        .expect(201)
        .then(() =>
          request(app.getHttpServer())
            .get('/api/v1/ledger/events/chain/verify')
            .set('Authorization', `Bearer ${auditorToken}`)
            .expect(200)
            .expect((res) => {
              expect(res.body.tenantId).toBe(suiteTenantId);
              expect(typeof res.body.valid).toBe('boolean');
              expect(res.body.checkedEvents).toBeGreaterThan(0);
              expect(Array.isArray(res.body.failures)).toBe(true);
            }),
        );
    });

    it('does not expose events from another tenant', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${differentTenantToken}`)
        .send(appendDto('other-tenant-subject'))
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(
        (response.body as LedgerEventListItem[]).some(
          (event) => event.subjectId === 'other-tenant-subject',
        ),
      ).toBe(false);
    });

    it('does not expose another tenant event by direct id lookup', async () => {
      const otherTenantEvent = await request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${differentTenantToken}`)
        .send(appendDto('other-tenant-detail-subject'))
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/ledger/events/${otherTenantEvent.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      const sameTenantEvent = await request(app.getHttpServer())
        .get(`/api/v1/ledger/events/${otherTenantEvent.body.id}`)
        .set('Authorization', `Bearer ${differentTenantToken}`)
        .expect(200);
      expect(sameTenantEvent.body).toMatchObject({
        id: otherTenantEvent.body.id,
        subjectId: 'other-tenant-detail-subject',
        metadata: expect.objectContaining({ tenantId: otherTenantId }),
      });
    });

    it('rejects explicit cross-tenant requests and records tenant isolation violation event', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-Id', otherTenantId)
        .expect(403);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const events = await dataSource.query(
        `SELECT payload->>'action' AS action, payload->>'requestedTenantId' AS requested_tenant_id, payload->>'actorTenantId' AS actor_tenant_id
         FROM ledger_events
         WHERE subject_id = $1 AND payload->>'action' = 'TENANT_ISOLATION_VIOLATION'
         ORDER BY created_at DESC LIMIT 1`,
        ['ledger-suite-user'],
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].action).toBe('TENANT_ISOLATION_VIOLATION');
      expect(events[0].requested_tenant_id).toBe(otherTenantId);
      expect(events[0].actor_tenant_id).toBe(suiteTenantId);
    });
  });

  describe('validation and error handling', () => {
    it('rejects client-supplied audit metadata', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...appendDto('spoof-attempt'),
          actorId: 'spoofed-user',
          metadata: { tenantId: '11111111-1111-1111-1111-111111111111' },
        })
        .expect(400);
    });

    it('rejects a device event missing deviceId and deviceType', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'DEVICE_LEDGER_EVENT',
          subjectType: 'measurement',
          subjectId: 'reading-2',
          payload: { temperature: 22.5 },
        })
        .expect(400);
    });

    it('returns 400 for invalid ids before querying Postgres UUID columns', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events/not-a-valid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Correlation-Id', 'corr-error')
        .expect(400)
        .expect((res) => {
          expect(res.body).toMatchObject({
            statusCode: 400,
            message: 'Ledger event id must be a UUID',
            correlationId: 'corr-error',
          });
        });
    });

    it('returns 404 for missing valid event ids', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events/550e8400-e29b-41d4-a716-446655440999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('handles SQL-injection-like ids as invalid UUID input', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ledger/events/${encodeURIComponent("1' OR '1'='1")}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('performance smoke checks', () => {
    it('creates a small sequence of events quickly', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/ledger/events')
          .set('Authorization', `Bearer ${authToken}`)
          .send(appendDto(`load-${i}`))
          .expect(201);
      }

      expect(Date.now() - startTime).toBeLessThan(10000);
    });
  });
});
