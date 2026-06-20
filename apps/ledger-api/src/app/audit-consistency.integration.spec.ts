import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InventoryLedgerEventAction } from '@true-north-ledger/inventory-contracts';
import { OrderLedgerEventAction } from '@true-north-ledger/order-contracts';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { AppModule } from './app.module';
import { RateLimitGuard } from './auth/rate-limit.guard';
import { createTestJwtToken } from './auth/test-helpers';

const tenantId = '00000000-0000-0000-0000-000000000000';

interface PersistedAuditEvent {
  actor_type: string;
  actor_id: string;
  subject_type: string;
  subject_id: string;
  tenant_id: string;
  correlation_id: string;
  request_id: string;
  user_agent: string;
  result: string;
  chain_sequence: string;
  payload_hash: string;
  event_hash: string;
  action: string;
  customer_id: string | null;
  sku: string | null;
  device_id: string | null;
}

async function waitForRows<T>(
  query: () => Promise<T[]>,
  timeoutMs = 1000,
  intervalMs = 50,
): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: T[] = [];

  do {
    rows = await query();
    if (rows.length > 0) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);

  return rows;
}

describe('Cross-module audit consistency (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rateLimitGuard: RateLimitGuard;
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
    await dataSource.query('TRUNCATE TABLE ledger_events, device_nonces, devices, inventory_items, orders CASCADE');

    token = createTestJwtToken({
      sub: 'audit-consistency-admin',
      username: 'audit.consistency',
      actorType: 'user',
      tenantId,
      permissions: [
        'devices.manage',
        'devices.read',
        'inventory.write',
        'inventory.read',
        'orders.write',
        'orders.read',
        'orders.status.write',
        'proof.read',
        'ledger.read',
      ],
    });
  });

  beforeEach(() => {
    rateLimitGuard.reset();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('persists tenant, actor, correlation, and subject metadata consistently across auth, device, order, and inventory events', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'audit-consistency-auth')
      .set('X-Correlation-Id', 'corr-auth-consistency')
      .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })
      .expect(200);

    const device = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'audit-consistency-device')
      .set('X-Correlation-Id', 'corr-device-consistency')
      .send({
        name: 'Audit consistency scanner',
        type: 'scanner',
        metadata: { suite: 'audit-consistency' },
      })
      .expect(201);

    const inventory = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'audit-consistency-inventory')
      .set('X-Correlation-Id', 'corr-inventory-consistency')
      .send({
        sku: 'SKU-AUDIT-CONSISTENCY',
        name: 'Audit consistency sensor',
        locationId: 'AUSTIN-AUDIT',
        locationName: 'Austin Audit Cage',
        quantity: 7,
        unitOfMeasure: 'each',
        metadata: { suite: 'audit-consistency' },
      })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'audit-consistency-order')
      .set('X-Correlation-Id', 'corr-order-request-ignored-by-domain-correlation')
      .send({
        customerId: 'customer-audit-consistency',
        customerName: 'Audit Consistency Customer',
        customerEmail: 'audit@example.com',
        items: [{ sku: 'SKU-AUDIT-CONSISTENCY', name: 'Audit consistency sensor', quantity: 1, unitPrice: 42 }],
        currency: 'USD',
        shippingAddress: {
          line1: '100 Audit Way',
          city: 'Austin',
          region: 'TX',
          postalCode: '78701',
          country: 'US',
        },
        idempotencyKey: 'audit-consistency-order-001',
      })
      .expect(201);

    const rows = await waitForRows<PersistedAuditEvent>(() =>
      dataSource.query(
        `SELECT actor_type,
                actor_id,
                subject_type,
                subject_id,
                tenant_id,
                correlation_id,
                request_id,
                user_agent,
                result,
                chain_sequence,
                payload_hash,
                event_hash,
                payload->>'action' AS action,
                payload->'actorMetadata'->>'customerId' AS customer_id,
                payload->>'sku' AS sku,
                payload->>'deviceId' AS device_id
         FROM ledger_events
         WHERE tenant_id = $1
           AND payload->>'action' = ANY($2::text[])
         ORDER BY chain_sequence ASC`,
        [
          tenantId,
          [
            AuthLedgerEventAction.LOGIN_SUCCESS,
            'DEVICE_REGISTERED',
            InventoryLedgerEventAction.INVENTORY_ADDED,
            OrderLedgerEventAction.ORDER_CREATED,
          ],
        ],
      ),
    );

    const byAction = new Map(rows.map((row) => [row.action, row]));
    const loginEvent = byAction.get(AuthLedgerEventAction.LOGIN_SUCCESS);
    const deviceEvent = byAction.get('DEVICE_REGISTERED');
    const inventoryEvent = byAction.get(InventoryLedgerEventAction.INVENTORY_ADDED);
    const orderEvent = byAction.get(OrderLedgerEventAction.ORDER_CREATED);

    expect(loginEvent).toMatchObject({
      actor_type: 'user',
      actor_id: 'admin',
      subject_type: 'auth',
      subject_id: 'admin',
      tenant_id: tenantId,
      correlation_id: 'corr-auth-consistency',
      user_agent: expect.stringContaining('audit-consistency-auth'),
      result: 'accepted',
    });
    expect(deviceEvent).toMatchObject({
      actor_type: 'user',
      actor_id: 'audit-consistency-admin',
      subject_type: 'device',
      subject_id: device.body.id,
      tenant_id: tenantId,
      correlation_id: 'corr-device-consistency',
      user_agent: expect.stringContaining('audit-consistency-device'),
      result: 'accepted',
    });
    expect(inventoryEvent).toMatchObject({
      actor_type: 'user',
      actor_id: 'audit-consistency-admin',
      subject_type: 'inventory',
      subject_id: inventory.body.id,
      tenant_id: tenantId,
      correlation_id: 'corr-inventory-consistency',
      user_agent: expect.stringContaining('audit-consistency-inventory'),
      result: 'accepted',
      sku: 'SKU-AUDIT-CONSISTENCY',
    });
    expect(orderEvent).toMatchObject({
      actor_type: 'user',
      actor_id: 'audit-consistency-admin',
      subject_type: 'order',
      subject_id: order.body.id,
      tenant_id: tenantId,
      correlation_id: order.body.correlationId,
      user_agent: expect.stringContaining('audit-consistency-order'),
      result: 'accepted',
      customer_id: 'customer-audit-consistency',
    });

    for (const row of [loginEvent, deviceEvent, inventoryEvent, orderEvent]) {
      expect(row?.request_id).toMatch(/[0-9a-f-]{36}/);
      expect(row?.payload_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row?.event_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(Number(row?.chain_sequence)).toBeGreaterThan(0);
    }
  });
});
