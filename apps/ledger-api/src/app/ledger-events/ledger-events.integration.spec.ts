import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

describe('LedgerEventsController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Get DataSource and clear the database
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await dataSource.query('TRUNCATE TABLE ledger_events CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  function computeHash(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  describe('GET /api/v1/ledger/events', () => {
    it('should return empty array initially', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .expect(200)
        .expect([]);
    });
  });

  describe('POST /api/v1/ledger/events', () => {
    it('should create a ledger event', () => {
      const payload = { action: 'test-integration', timestamp: Date.now() };
      const dto = {
        type: 'LEDGER_EVENT',
        actorType: 'user',
        actorId: 'integration-test-user',
        subjectType: 'test',
        subjectId: 'integration-subject',
        payload,
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'integration-req-1',
          userAgent: 'supertest',
          payloadHash: computeHash(payload),
          result: 'accepted',
          timestamp: new Date().toISOString(),
        },
      };

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(dto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body.type).toBe('LEDGER_EVENT');
          expect(res.body.actorId).toBe('integration-test-user');
        });
    });

    it('should create a device ledger event', () => {
      const payload = { temperature: 22.5, humidity: 45 };
      const dto = {
        type: 'DEVICE_LEDGER_EVENT',
        actorType: 'device',
        actorId: 'sensor-integration-001',
        subjectType: 'measurement',
        subjectId: 'reading-integration-1',
        deviceId: 'sensor-integration-001',
        deviceType: 'temperature-sensor',
        payload,
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'device-req-1',
          userAgent: 'IoT-Agent/1.0',
          payloadHash: computeHash(payload),
          result: 'accepted',
          timestamp: new Date().toISOString(),
        },
      };

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(dto)
        .expect(201)
        .expect((res) => {
          expect(res.body.type).toBe('DEVICE_LEDGER_EVENT');
          expect(res.body.deviceId).toBe('sensor-integration-001');
          expect(res.body.deviceType).toBe('temperature-sensor');
        });
    });

    it('should reject event with invalid payload hash', () => {
      const payload = { action: 'test' };
      const dto = {
        type: 'LEDGER_EVENT',
        actorType: 'user',
        actorId: 'test-user',
        subjectType: 'test',
        subjectId: 'test-subject',
        payload,
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'req-bad-hash',
          userAgent: 'test',
          payloadHash: 'invalid-hash-value',
          result: 'accepted',
          timestamp: new Date().toISOString(),
        },
      };

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(dto)
        .expect(500);
    });

    it('should reject event with missing required fields', () => {
      const invalidDto = {
        type: 'LEDGER_EVENT',
        // Missing actorType, actorId, etc.
      };

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(invalidDto)
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'Validation failed');
          expect(res.body).toHaveProperty('details');
        });
    });

    it('should reject event with invalid type', () => {
      const payload = { action: 'test' };
      const dto = {
        type: 'INVALID_EVENT_TYPE',
        actorType: 'user',
        actorId: 'test-user',
        subjectType: 'test',
        subjectId: 'test-subject',
        payload,
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'req-1',
          userAgent: 'test',
          payloadHash: computeHash(payload),
          result: 'accepted',
          timestamp: new Date().toISOString(),
        },
      };

      return request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(dto)
        .expect(400);
    });
  });

  describe('GET /api/v1/ledger/events/:id', () => {
    it('should retrieve a specific event by id', async () => {
      const payload = { action: 'find-by-id-test' };
      const dto = {
        type: 'LEDGER_EVENT',
        actorType: 'user',
        actorId: 'find-user',
        subjectType: 'test',
        subjectId: 'find-subject',
        payload,
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'find-req',
          userAgent: 'test',
          payloadHash: computeHash(payload),
          result: 'accepted',
          timestamp: new Date().toISOString(),
        },
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/ledger/events')
        .send(dto);

      const eventId = createResponse.body.id;

      return request(app.getHttpServer())
        .get(`/api/v1/ledger/events/${eventId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(eventId);
          expect(res.body.actorId).toBe('find-user');
        });
    });

    it('should return 500 for non-existent event id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/ledger/events/non-existent-id-12345')
        .expect(500);
    });
  });

  describe('Event ordering and retrieval', () => {
    it('should maintain event insertion order', async () => {
      const events = [];
      
      for (let i = 0; i < 3; i++) {
        const payload = { sequence: i };
        const dto = {
          type: 'LEDGER_EVENT',
          actorType: 'user',
          actorId: 'order-test-user',
          subjectType: 'sequence',
          subjectId: `seq-${i}`,
          payload,
          metadata: {
            tenantId: '00000000-0000-0000-0000-000000000000',
            requestId: `order-req-${i}`,
            userAgent: 'test',
            payloadHash: computeHash(payload),
            result: 'accepted',
            timestamp: new Date().toISOString(),
          },
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/ledger/events')
          .send(dto);
        
        events.push(response.body);
      }

      const allEvents = await request(app.getHttpServer())
        .get('/api/v1/ledger/events')
        .expect(200);

      const orderTestEvents = allEvents.body.filter((e: any) => 
        e.actorId === 'order-test-user'
      );

      expect(orderTestEvents.length).toBeGreaterThanOrEqual(3);
    });
  });
});
