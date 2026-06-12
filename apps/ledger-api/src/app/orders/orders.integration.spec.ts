import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { CreateOrderRequest, OrderProof, OrderStatus } from '@true-north-ledger/order-contracts';
import { OrderLedgerEventAction } from '@true-north-ledger/order-contracts';
import { AppModule } from '../app.module';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { createTestJwtToken } from '../auth/test-helpers';

const tenantId = '00000000-0000-0000-0000-000000000000';

function buildCreateOrderRequest(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  const customerId = overrides.customerId ?? `customer-${Date.now()}`;
  return {
    customerId,
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    items: [
      {
        sku: 'SKU-100',
        name: 'Serialized sensor kit',
        quantity: 2,
        unitPrice: 49.5,
        metadata: { lot: 'LOT-42' },
      },
    ],
    currency: 'USD',
    shippingAddress: {
      line1: '100 Warehouse Way',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    metadata: { source: 'integration', lane: 'north-dock' },
    idempotencyKey: `integration-${customerId}-${Date.now()}`,
    ...overrides,
  };
}

describe('OrdersController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rateLimitGuard: RateLimitGuard;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
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
    await dataSource.query('TRUNCATE TABLE ledger_events, orders CASCADE');

    token = createTestJwtToken({
      sub: 'orders-integration-admin',
      username: 'orders.integration',
      actorType: 'user',
      tenantId,
      permissions: ['orders.read', 'orders.write', 'orders.status.write', 'proof.read'],
    });
  });

  beforeEach(() => {
    rateLimitGuard.reset();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createOrder(overrides: Partial<CreateOrderRequest> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'orders-integration-suite')
      .send(buildCreateOrderRequest(overrides))
      .expect(201);
  }

  it('creates an order and records ORDER_CREATED with a correlation id', async () => {
    const response = await createOrder({
      customerId: 'customer-create-001',
      customerName: 'Create Flow Customer',
      metadata: { source: 'integration', flow: 'creation' },
      idempotencyKey: 'integration-create-001',
    });

    expect(response.body).toMatchObject({
      tenantId,
      customerId: 'customer-create-001',
      customerName: 'Create Flow Customer',
      status: 'pending',
      totalAmount: 99,
      currency: 'USD',
      correlationId: expect.any(String),
    });
    expect(response.body.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);

    const rows = await dataSource.query(
      `SELECT order_number, tenant_id, status, total_amount, correlation_id
       FROM orders WHERE id = $1`,
      [response.body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_number: response.body.orderNumber,
      tenant_id: tenantId,
      status: 'pending',
      correlation_id: response.body.correlationId,
    });
    expect(Number(rows[0].total_amount)).toBe(99);

    const auditEvents = await dataSource.query(
      `SELECT payload->>'action' AS action,
              payload->>'orderNumber' AS order_number,
              payload->>'customerId' AS customer_id,
              payload->'actorMetadata'->>'customerId' AS actor_customer_id,
              correlation_id
       FROM ledger_events WHERE subject_id = $1 ORDER BY created_at ASC`,
      [response.body.id],
    );
    expect(auditEvents).toEqual([
      expect.objectContaining({
        action: OrderLedgerEventAction.ORDER_CREATED,
        order_number: response.body.orderNumber,
        customer_id: 'customer-create-001',
        actor_customer_id: 'customer-create-001',
        correlation_id: response.body.correlationId,
      }),
    ]);
  });

  it('runs the full order lifecycle and keeps one correlation id across status events', async () => {
    const created = await createOrder({
      customerId: 'customer-lifecycle-001',
      idempotencyKey: 'integration-lifecycle-001',
    });
    const statuses: OrderStatus[] = ['confirmed', 'processing', 'shipped', 'delivered'];

    let current = created.body;
    for (const status of statuses) {
      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${created.body.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status, reason: `Move to ${status}` })
        .expect(200);

      expect(updated.body.status).toBe(status);
      expect(updated.body.correlationId).toBe(created.body.correlationId);
      current = updated.body;
    }

    expect(current.status).toBe('delivered');
    expect(current.deliveredAt).toBeTruthy();

    const statusEvents = await dataSource.query(
      `SELECT payload->>'action' AS action,
              payload->>'statusAction' AS status_action,
              payload->>'status' AS status,
              payload->>'previousStatus' AS previous_status,
              payload->'actorMetadata'->>'customerId' AS actor_customer_id,
              correlation_id
       FROM ledger_events
       WHERE subject_id = $1
       ORDER BY created_at ASC`,
      [created.body.id],
    );

    expect(statusEvents.map((event: { correlation_id: string }) => event.correlation_id)).toEqual(
      Array.from({ length: 5 }, () => created.body.correlationId),
    );
    expect(statusEvents.map((event: { action: string }) => event.action)).toEqual([
      OrderLedgerEventAction.ORDER_CREATED,
      OrderLedgerEventAction.ORDER_STATUS_CHANGED,
      OrderLedgerEventAction.ORDER_STATUS_CHANGED,
      OrderLedgerEventAction.ORDER_STATUS_CHANGED,
      OrderLedgerEventAction.ORDER_STATUS_CHANGED,
    ]);
    expect(statusEvents.map((event: { actor_customer_id: string }) => event.actor_customer_id)).toEqual(
      Array.from({ length: 5 }, () => 'customer-lifecycle-001'),
    );
    expect(statusEvents.map((event: { status_action: string | null }) => event.status_action).filter(Boolean)).toEqual([
      OrderLedgerEventAction.ORDER_CONFIRMED,
      OrderLedgerEventAction.ORDER_PROCESSING,
      OrderLedgerEventAction.ORDER_SHIPPED,
      OrderLedgerEventAction.ORDER_DELIVERED,
    ]);
  });

  it('cancels pending orders and rejects cancellation after shipment', async () => {
    const cancellable = await createOrder({
      customerId: 'customer-cancel-001',
      idempotencyKey: 'integration-cancel-001',
    });

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/orders/${cancellable.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Customer request' })
      .expect(200);

    expect(cancelled.body).toMatchObject({
      id: cancellable.body.id,
      status: 'cancelled',
      cancelledAt: expect.any(String),
    });

    const shipped = await createOrder({
      customerId: 'customer-cancel-002',
      idempotencyKey: 'integration-cancel-002',
    });
    for (const status of ['confirmed', 'processing', 'shipped'] as OrderStatus[]) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${shipped.body.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status, reason: `Move to ${status}` })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${shipped.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Too late' })
      .expect(400);

    const cancelEvents = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'reason' AS reason
       FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = $2`,
      [cancellable.body.id, OrderLedgerEventAction.ORDER_CANCELLED],
    );
    expect(cancelEvents).toEqual([
      expect.objectContaining({
        action: OrderLedgerEventAction.ORDER_CANCELLED,
        reason: 'Customer request',
      }),
    ]);
  });

  it('searches orders by number, customer, date range, and metadata text', async () => {
    const first = await createOrder({
      customerId: 'customer-search-001',
      customerName: 'Searchable Northwind',
      customerEmail: 'searchable@example.com',
      metadata: { source: 'integration', searchToken: 'metadata-needle' },
      idempotencyKey: 'integration-search-001',
    });
    await createOrder({
      customerId: 'customer-search-002',
      customerName: 'Other Customer',
      customerEmail: 'other@example.com',
      metadata: { source: 'integration', searchToken: 'other' },
      idempotencyKey: 'integration-search-002',
    });

    const createdFrom = encodeURIComponent(new Date(Date.now() - 60_000).toISOString());
    const createdTo = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const byNumber = await request(app.getHttpServer())
      .get(`/api/v1/orders/search?query=${first.body.orderNumber}&createdFrom=${createdFrom}&createdTo=${createdTo}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(byNumber.body.orders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.body.id, orderNumber: first.body.orderNumber })]),
    );

    const byCustomer = await request(app.getHttpServer())
      .get('/api/v1/orders/search?query=searchable&page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byCustomer.body.orders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.body.id, customerName: 'Searchable Northwind' })]),
    );

    const byMetadata = await request(app.getHttpServer())
      .get('/api/v1/orders/search?query=metadata-needle&page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byMetadata.body.orders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.body.id })]),
    );
  });

  it('rejects invalid order payloads and keeps tenant data isolated', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...buildCreateOrderRequest({
          customerId: 'customer-invalid-001',
          idempotencyKey: 'integration-invalid-001',
        }),
        items: [{ sku: '', name: 'Invalid item', quantity: 0, unitPrice: -1 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...buildCreateOrderRequest({
          customerId: 'customer-invalid-002',
          idempotencyKey: 'integration-invalid-002',
        }),
        customerEmail: 'not-an-email',
      })
      .expect(400);

    const isolated = await createOrder({
      customerId: 'customer-isolated-001',
      idempotencyKey: 'integration-isolated-001',
    });
    const otherTenantToken = createTestJwtToken({
      sub: 'orders-other-tenant-user',
      actorType: 'user',
      tenantId: '99999999-9999-4999-8999-999999999999',
      permissions: ['orders.read'],
    });

    const otherTenantList = await request(app.getHttpServer())
      .get('/api/v1/orders?query=customer-isolated-001')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(otherTenantList.body.orders).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${isolated.body.id}`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(404);
  });

  it('generates, verifies, and rejects tampered proofs while exposing chronological timeline', async () => {
    const created = await createOrder({
      customerId: 'customer-proof-001',
      idempotencyKey: 'integration-proof-001',
    });
    for (const status of ['confirmed', 'processing'] as OrderStatus[]) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${created.body.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status, reason: `Move to ${status}` })
        .expect(200);
    }

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/orders/${created.body.id}/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(timeline.body.map((event: { status?: OrderStatus }) => event.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
    ]);
    expect(timeline.body.every((event: { correlationId: string }) => event.correlationId === created.body.correlationId)).toBe(true);
    expect(timeline.body.every((event: { actorMetadata: { customerId: string } }) => event.actorMetadata.customerId === 'customer-proof-001')).toBe(true);

    const proof = await request(app.getHttpServer())
      .get(`/api/v1/orders/${created.body.id}/proof`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(proof.body).toMatchObject({
      orderId: created.body.id,
      orderNumber: created.body.orderNumber,
      correlationId: created.body.correlationId,
      proofHash: expect.any(String),
    });
    expect(proof.body.events).toHaveLength(3);

    const verification = await request(app.getHttpServer())
      .post('/api/v1/proofs/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ proof: proof.body })
      .expect(200);
    expect(verification.body).toMatchObject({
      valid: true,
      proofHash: proof.body.proofHash,
    });

    const tamperedProof: OrderProof = {
      ...proof.body,
      events: [
        proof.body.events[1],
        proof.body.events[0],
        proof.body.events[2],
      ],
    };
    const tampered = await request(app.getHttpServer())
      .post('/api/v1/proofs/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ proof: tamperedProof })
      .expect(200);
    expect(tampered.body.valid).toBe(false);
    expect(tampered.body.reason).toMatch(/chronological order|ORDER_CREATED/);
  });
});
