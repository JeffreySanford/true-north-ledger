import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InventoryLedgerEventAction } from '@true-north-ledger/inventory-contracts';
import { AppModule } from '../app.module';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { createTestJwtToken } from '../auth/test-helpers';

const tenantId = '00000000-0000-0000-0000-000000000000';
const otherTenantId = '11111111-1111-4111-8111-111111111111';

describe('InventoryController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rateLimitGuard: RateLimitGuard;
  let token: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
    process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX = '1000';
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    rateLimitGuard = app.get(RateLimitGuard);
    await dataSource.query('TRUNCATE TABLE ledger_events, inventory_items CASCADE');
    token = createTestJwtToken({
      sub: 'inventory-admin',
      username: 'inventory.admin',
      actorType: 'user',
      tenantId,
      permissions: ['inventory.read', 'inventory.write', 'devices.manage'],
    });
    otherTenantToken = createTestJwtToken({
      sub: 'other-inventory-admin',
      username: 'other.inventory.admin',
      actorType: 'user',
      tenantId: otherTenantId,
      permissions: ['inventory.read', 'inventory.write'],
    });
  });

  beforeEach(() => rateLimitGuard.reset());
  afterAll(async () => app?.close());

  const payload = {
    sku: 'SKU-100',
    name: 'Serialized sensor kit',
    locationId: 'AUSTIN-A1',
    locationName: 'Austin Warehouse - Aisle A1',
    quantity: 25,
    unitOfMeasure: 'each',
    metadata: { source: 'integration' },
  };

  it('adds inventory, persists it, and records INVENTORY_ADDED provenance', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      tenantId,
      sku: 'SKU-100',
      status: 'available',
      quantity: 25,
      locationId: 'AUSTIN-A1',
    });
    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'locationId' AS location_id,
              payload->>'quantity' AS quantity
       FROM ledger_events WHERE subject_id = $1`,
      [response.body.id],
    );
    expect(events).toEqual([
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_ADDED,
        location_id: 'AUSTIN-A1',
        quantity: '25',
      }),
    ]);
  });

  it('imports inventory with partial success and ledger events for accepted rows', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { ...payload, sku: 'SKU-IMPORT-1', name: 'Imported sensor one' },
          { ...payload, sku: 'SKU-100', name: 'Duplicate serialized sensor kit' },
        ],
      })
      .expect(200);

    expect(response.body.results).toEqual([
      expect.objectContaining({
        index: 0,
        sku: 'SKU-IMPORT-1',
        success: true,
        item: expect.objectContaining({ sku: 'SKU-IMPORT-1', tenantId }),
      }),
      expect.objectContaining({
        index: 1,
        sku: 'SKU-100',
        success: false,
        error: 'Inventory SKU SKU-100 already exists for tenant',
      }),
    ]);

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'sku' AS sku
       FROM ledger_events
       WHERE payload->>'sku' = $1 AND payload->>'action' = $2`,
      ['SKU-IMPORT-1', InventoryLedgerEventAction.INVENTORY_ADDED],
    );
    expect(events).toEqual([
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_ADDED,
        sku: 'SKU-IMPORT-1',
      }),
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] })
      .expect(400);
  });

  it('filters inventory and isolates tenant records', async () => {
    const tenantList = await request(app.getHttpServer())
      .get('/api/v1/inventory?status=available&locationId=AUSTIN-A1&query=serialized')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tenantList.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });

    const otherTenantList = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(otherTenantList.body).toMatchObject({ items: [], total: 0 });
  });

  it('retrieves full inventory details by ID and normalized SKU with tenant isolation', async () => {
    const rows = await dataSource.query(
      `SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`,
      [tenantId],
    );
    const id = rows[0].id;

    const byId = await request(app.getHttpServer())
      .get(`/api/v1/inventory/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byId.body).toMatchObject({ id, sku: 'SKU-100', metadata: { source: 'integration' } });

    const withProvenance = await request(app.getHttpServer())
      .get(`/api/v1/inventory/${id}?includeProvenance=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(withProvenance.body).toMatchObject({
      item: expect.objectContaining({ id, sku: 'SKU-100' }),
      events: [expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_ADDED })],
      reservationHistory: [],
      scanHistory: [],
    });

    const bySku = await request(app.getHttpServer())
      .get('/api/v1/inventory/sku/sku-100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bySku.body).toMatchObject({ id, sku: 'SKU-100' });

    await request(app.getHttpServer())
      .get(`/api/v1/inventory/${id}`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/sku/SKU-100')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(404);
  });

  it('rejects duplicate tenant SKUs and invalid quantities', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-INVALID', quantity: -1 })
      .expect(400);
  });

  it('reserves inventory for an order, rejects over-reservation, and releases it', async () => {
    const item = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`, [tenantId]);
    const id = item[0].id;
    const orderId = '77777777-7777-4777-8777-777777777777';

    const reserved = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 5, orderId })
      .expect(200);
    expect(reserved.body).toMatchObject({
      quantity: 20,
      reservedQuantity: 5,
      reservationOrderId: orderId,
      status: 'reserved',
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 21 })
      .expect(409);

    const released = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Order cancelled' })
      .expect(200);
    expect(released.body).toMatchObject({
      quantity: 25,
      reservedQuantity: 0,
      reservationOrderId: null,
      status: 'available',
    });

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action FROM ledger_events WHERE subject_id = $1 ORDER BY created_at`,
      [id],
    );
    expect(events.map((event: { action: string }) => event.action)).toEqual([
      InventoryLedgerEventAction.INVENTORY_ADDED,
      InventoryLedgerEventAction.INVENTORY_RESERVED,
      InventoryLedgerEventAction.INVENTORY_RESERVATION_RELEASED,
    ]);
  });

  it('releases expired reservations through the timeout workflow', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-TIMEOUT', quantity: 9 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${created.body.id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3, timeoutMinutes: 1 })
      .expect(200);

    await dataSource.query(
      `UPDATE inventory_items
       SET metadata = jsonb_set(metadata, '{reservationExpiresAt}', to_jsonb($1::text), true)
       WHERE id = $2`,
      ['2026-06-11T11:00:00.000Z', created.body.id],
    );

    const released = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations/release-expired')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(released.body).toMatchObject({
      total: 1,
      released: [expect.objectContaining({
        id: created.body.id,
        quantity: 9,
        reservedQuantity: 0,
        status: 'available',
      })],
    });

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'reason' AS reason,
              payload->>'reservationExpiredAt' AS reservation_expired_at
       FROM ledger_events WHERE subject_id = $1 ORDER BY created_at`,
      [created.body.id],
    );
    expect(events).toEqual([
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_ADDED }),
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_RESERVED }),
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_RESERVATION_RELEASED,
        reason: 'Reservation timeout expired',
        reservation_expired_at: '2026-06-11T11:00:00.000Z',
      }),
    ]);
  });

  it('moves inventory and records from/to locations with actor attribution', async () => {
    const item = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`, [tenantId]);
    const id = item[0].id;

    const moved = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2', reason: 'Cycle count' })
      .expect(200);
    expect(moved.body).toMatchObject({
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
      quantity: 25,
      status: 'available',
    });

    const event = await dataSource.query(
      `SELECT actor_id, payload->>'action' AS action, payload->'fromLocation' AS from_location,
              payload->'toLocation' AS to_location
       FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = $2`,
      [id, InventoryLedgerEventAction.INVENTORY_MOVED],
    );
    expect(event).toEqual([
      expect.objectContaining({
        actor_id: 'inventory-admin',
        action: InventoryLedgerEventAction.INVENTORY_MOVED,
        from_location: { id: 'AUSTIN-A1', name: 'Austin Warehouse - Aisle A1' },
        to_location: { id: 'AUSTIN-B2', name: 'Austin Warehouse - Aisle B2' },
      }),
    ]);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/move`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ locationId: 'OTHER-C1', locationName: 'Other Tenant Location' })
      .expect(404);
  });

  it('bulk moves inventory with per-item results and ledger events for accepted moves', async () => {
    const existing = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`, [tenantId]);
    const firstId = existing[0].id;
    const second = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-BULK-MOVE', quantity: 9 })
      .expect(201);
    const missingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/move/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        itemIds: [firstId, second.body.id, missingId],
        locationId: 'AUSTIN-C3',
        locationName: 'Austin Warehouse - Aisle C3',
        reason: 'Bulk aisle rebalance',
      })
      .expect(200);

    expect(response.body.results).toEqual([
      expect.objectContaining({ index: 0, itemId: firstId, success: true, item: expect.objectContaining({ locationId: 'AUSTIN-C3' }) }),
      expect.objectContaining({ index: 1, itemId: second.body.id, success: true, item: expect.objectContaining({ locationName: 'Austin Warehouse - Aisle C3' }) }),
      expect.objectContaining({ index: 2, itemId: missingId, success: false, error: `Inventory item ${missingId} not found` }),
    ]);

    const events = await dataSource.query(
      `SELECT subject_id, payload->>'action' AS action, payload->>'reason' AS reason
       FROM ledger_events
       WHERE subject_id = ANY($1::text[]) AND payload->>'action' = $2`,
      [[firstId, second.body.id], InventoryLedgerEventAction.INVENTORY_MOVED],
    );
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject_id: firstId, action: InventoryLedgerEventAction.INVENTORY_MOVED, reason: 'Bulk aisle rebalance' }),
      expect.objectContaining({ subject_id: second.body.id, action: InventoryLedgerEventAction.INVENTORY_MOVED, reason: 'Bulk aisle rebalance' }),
    ]));

    await request(app.getHttpServer())
      .post('/api/v1/inventory/move/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemIds: [], locationId: 'AUSTIN-C3', locationName: 'Austin Warehouse - Aisle C3' })
      .expect(400);
  });

  it('adjusts quantity and changes status with ledger provenance and guarded transitions', async () => {
    const item = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`, [tenantId]);
    const id = item[0].id;

    const adjusted = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/quantity`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 18, reason: 'Cycle count reconciliation' })
      .expect(200);
    expect(adjusted.body).toMatchObject({ quantity: 18, status: 'available' });

    const changed = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'damaged', reason: 'Quality hold' })
      .expect(200);
    expect(changed.body).toMatchObject({ quantity: 18, status: 'damaged' });

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'reserved', reason: 'Must use reservation workflow' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/status`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ status: 'expired', reason: 'Other tenant cannot change it' })
      .expect(404);

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'previousQuantity' AS previous_quantity,
              payload->>'adjustedQuantity' AS adjusted_quantity, payload->>'previousStatus' AS previous_status,
              payload->>'status' AS status
       FROM ledger_events WHERE subject_id = $1 AND payload->>'action' IN ($2, $3)
       ORDER BY created_at`,
      [id, InventoryLedgerEventAction.INVENTORY_QUANTITY_ADJUSTED, InventoryLedgerEventAction.INVENTORY_STATUS_CHANGED],
    );
    expect(events).toEqual([
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_QUANTITY_ADJUSTED,
        previous_quantity: '25',
        adjusted_quantity: '18',
      }),
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_STATUS_CHANGED,
        previous_status: 'available',
        status: 'damaged',
      }),
    ]);
  });

  it('soft-removes inventory, retains the record, and prevents reserved removal', async () => {
    const item = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-100'`, [tenantId]);
    const id = item[0].id;
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/inventory/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Cannot remove while reserved' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${id}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/inventory/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Damaged beyond repair' })
      .expect(200);
    expect(removed.body).toMatchObject({
      id,
      status: 'removed',
      quantity: 0,
      removalReason: 'Damaged beyond repair',
      removedAt: expect.any(String),
    });

    const rows = await dataSource.query(
      'SELECT status, quantity, removal_reason, removed_at FROM inventory_items WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([expect.objectContaining({
      status: 'removed',
      quantity: 0,
      removal_reason: 'Damaged beyond repair',
      removed_at: expect.any(Date),
    })]);
  });

  it('scans inventory by SKU and serial number with user and device actor attribution', async () => {
    const serialPayload = { ...payload, sku: 'SKU-SCAN', serialNumber: 'SERIAL-SCAN-001' };
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send(serialPayload)
      .expect(201);

    const userScan = await request(app.getHttpServer())
      .post('/api/v1/inventory/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'sku-scan', scanType: 'manual', locationId: 'AUSTIN-A1' })
      .expect(200);
    expect(userScan.body).toMatchObject({ id: created.body.id, sku: 'SKU-SCAN', lastScannedAt: expect.any(String) });

    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Inventory scanner ${Date.now()}`, type: 'scanner' })
      .expect(201);
    const deviceScan = await request(app.getHttpServer())
      .post('/api/v1/inventory/scan')
      .set('X-Device-Key', registration.body.apiKey)
      .send({ value: 'SERIAL-SCAN-001', scanType: 'barcode', locationId: 'AUSTIN-A1' })
      .expect(200);
    expect(deviceScan.body).toMatchObject({ id: created.body.id, serialNumber: 'SERIAL-SCAN-001' });

    const events = await dataSource.query(
      `SELECT actor_id, actor_type, payload->>'action' AS action, payload->>'deviceId' AS device_id,
              payload->>'scanType' AS scan_type
       FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = $2 ORDER BY created_at`,
      [created.body.id, InventoryLedgerEventAction.INVENTORY_SCANNED],
    );
    expect(events).toEqual([
      expect.objectContaining({ actor_id: 'inventory-admin', actor_type: 'user', scan_type: 'manual' }),
      expect.objectContaining({
        actor_id: registration.body.id,
        actor_type: 'device',
        device_id: registration.body.id,
        scan_type: 'barcode',
      }),
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/scan')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ value: 'SKU-SCAN', scanType: 'manual' })
      .expect(404);
  });

  it('tracks inventory automatically from inventory.scan device events', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-DEVICE-EVENT', name: 'Device event tracked sensor' })
      .expect(201);

    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Inventory event scanner ${Date.now()}`, type: 'scanner' })
      .expect(201);

    const ingested = await request(app.getHttpServer())
      .post('/api/v1/device-events')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        eventType: 'inventory.scan',
        nonce: 'inventory-device-event-scan-1',
        payload: { sku: 'sku-device-event', scanType: 'barcode', locationId: 'AUSTIN-A1' },
      })
      .expect(201);

    expect(ingested.body).toMatchObject({
      eventId: expect.any(String),
      nonce: 'inventory-device-event-scan-1',
    });

    const events = await dataSource.query(
      `SELECT actor_id, actor_type, payload->>'action' AS action, payload->>'deviceId' AS device_id,
              payload->>'scanType' AS scan_type, payload->>'scanValue' AS scan_value,
              payload->>'sourceEventType' AS source_event_type
       FROM ledger_events WHERE subject_id = $1 AND payload->>'action' = $2`,
      [created.body.id, InventoryLedgerEventAction.INVENTORY_SCANNED],
    );
    expect(events).toEqual([
      expect.objectContaining({
        actor_id: registration.body.id,
        actor_type: 'device',
        device_id: registration.body.id,
        scan_type: 'barcode',
        scan_value: 'sku-device-event',
        source_event_type: 'inventory.scan',
      }),
    ]);
  });

  it('bulk scans inventory with per-item results and device attribution', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Bulk inventory scanner ${Date.now()}`, type: 'scanner' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/scan/batch')
      .set('X-Device-Key', registration.body.apiKey)
      .send({
        scans: [
          { value: 'SKU-SCAN', scanType: 'barcode', locationId: 'AUSTIN-A1' },
          { value: 'UNKNOWN', scanType: 'barcode', locationId: 'AUSTIN-A1' },
        ],
      })
      .expect(200);

    expect(response.body.results).toEqual([
      expect.objectContaining({ index: 0, value: 'SKU-SCAN', success: true, item: expect.objectContaining({ sku: 'SKU-SCAN' }) }),
      expect.objectContaining({ index: 1, value: 'UNKNOWN', success: false, error: 'Inventory item UNKNOWN not found' }),
    ]);
    const events = await dataSource.query(
      `SELECT actor_id, payload->>'deviceId' AS device_id FROM ledger_events
       WHERE subject_id = $1 AND payload->>'action' = $2 ORDER BY created_at DESC LIMIT 1`,
      [response.body.results[0].item.id, InventoryLedgerEventAction.INVENTORY_SCANNED],
    );
    expect(events).toEqual([
      expect.objectContaining({ actor_id: registration.body.id, device_id: registration.body.id }),
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/scan/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ scans: [] })
      .expect(400);
  });

  it('rejects wrong-location scans, exposes the anomaly, and clears it after confirmation', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-LOCATION', quantity: 10 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'SKU-LOCATION', scanType: 'manual', locationId: 'AUSTIN-B2' })
      .expect(409);

    const anomaly = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?type=unexpected_location&severity=error')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(anomaly.body).toMatchObject({
      total: 1,
      anomalies: [expect.objectContaining({
        itemId: created.body.id,
        type: 'unexpected_location',
        details: expect.objectContaining({ expectedLocationId: 'AUSTIN-A1', scannedLocationId: 'AUSTIN-B2' }),
      })],
    });

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action, payload->>'accepted' AS accepted,
              payload->>'anomalyType' AS anomaly_type
       FROM ledger_events WHERE subject_id = $1 ORDER BY created_at`,
      [created.body.id],
    );
    expect(events).toEqual([
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_ADDED }),
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_SCANNED, accepted: 'false' }),
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_ANOMALY_DETECTED, anomaly_type: 'unexpected_location' }),
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'SKU-LOCATION', scanType: 'manual', locationId: 'AUSTIN-A1' })
      .expect(200);

    const cleared = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?type=unexpected_location')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cleared.body).toEqual({ anomalies: [], total: 0 });
  });

  it('returns a tenant-isolated chronological provenance chain', async () => {
    const item = await dataSource.query(`SELECT id FROM inventory_items WHERE tenant_id = $1 AND sku = 'SKU-SCAN'`, [tenantId]);
    const id = item[0].id;
    const response = await request(app.getHttpServer())
      .get(`/api/v1/inventory/${id}/provenance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.item).toMatchObject({ id, sku: 'SKU-SCAN' });
    expect(response.body.events.map((event: { action: string }) => event.action)).toEqual([
      InventoryLedgerEventAction.INVENTORY_ADDED,
      InventoryLedgerEventAction.INVENTORY_SCANNED,
      InventoryLedgerEventAction.INVENTORY_SCANNED,
      InventoryLedgerEventAction.INVENTORY_SCANNED,
    ]);
    expect(response.body.events[2]).toMatchObject({
      actorType: 'device',
      deviceId: expect.any(String),
      locationId: 'AUSTIN-A1',
      quantity: 25,
    });
    expect(response.body.events[0].chainSequence).toBeLessThan(response.body.events[1].chainSequence);
    expect(response.body.scanHistory).toHaveLength(3);
    expect(response.body.scanHistory.every(
      (event: { action: string }) => event.action === InventoryLedgerEventAction.INVENTORY_SCANNED,
    )).toBe(true);
    expect(response.body.reservationHistory).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/v1/inventory/${id}/provenance`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(404);
  });

  it('detects, filters, and records tenant inventory anomalies', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...payload,
        sku: 'SKU-ANOMALY',
        quantity: 2,
        expirationDate: '2026-01-01',
        metadata: {
          expectedQuantity: 5,
          expectedLocationId: 'AUSTIN-C3',
          expectedLocationName: 'Austin Warehouse - Aisle C3',
        },
      })
      .expect(201);
    await dataSource.query(`UPDATE inventory_items SET status = 'damaged' WHERE id = $1`, [created.body.id]);

    const critical = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?severity=critical&type=expired')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(critical.body).toMatchObject({
      total: 1,
      anomalies: [expect.objectContaining({ itemId: created.body.id, type: 'expired', severity: 'critical', status: 'open' })],
    });
    const detectedDate = critical.body.anomalies[0].detectedAt.slice(0, 10);
    const dated = await request(app.getHttpServer())
      .get(`/api/v1/inventory/anomalies?detectedFrom=${detectedDate}&detectedTo=${detectedDate}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dated.body.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: created.body.id, type: 'expired' }),
    ]));

    await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?detectedFrom=2026-06-12&detectedTo=2026-06-11')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const discrepancy = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?type=quantity_discrepancy&severity=error')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(discrepancy.body).toMatchObject({
      total: 1,
      anomalies: [expect.objectContaining({
        itemId: created.body.id,
        type: 'quantity_discrepancy',
        details: expect.objectContaining({ quantity: 2, expectedQuantity: 5, delta: -3 }),
      })],
    });

    const unexpectedMove = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies?type=unexpected_location&severity=error')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unexpectedMove.body).toMatchObject({
      total: 1,
      anomalies: [expect.objectContaining({
        itemId: created.body.id,
        type: 'unexpected_location',
        details: expect.objectContaining({
          currentLocationId: 'AUSTIN-A1',
          expectedLocationId: 'AUSTIN-C3',
        }),
      })],
    });

    const detected = await request(app.getHttpServer())
      .post('/api/v1/inventory/anomalies/detect')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(detected.body.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: created.body.id, type: 'low_stock' }),
      expect.objectContaining({ itemId: created.body.id, type: 'expired' }),
      expect.objectContaining({ itemId: created.body.id, type: 'damaged_not_removed' }),
      expect.objectContaining({ itemId: created.body.id, type: 'quantity_discrepancy' }),
      expect.objectContaining({ itemId: created.body.id, type: 'unexpected_location' }),
    ]));

    const events = await dataSource.query(
      `SELECT payload->>'anomalyType' AS anomaly_type FROM ledger_events
       WHERE subject_id = $1 AND payload->>'action' = $2`,
      [created.body.id, InventoryLedgerEventAction.INVENTORY_ANOMALY_DETECTED],
    );
    expect(events.map((event: { anomaly_type: string }) => event.anomaly_type)).toEqual(
      expect.arrayContaining(['low_stock', 'expired', 'damaged_not_removed', 'quantity_discrepancy', 'unexpected_location']),
    );

    const isolated = await request(app.getHttpServer())
      .get('/api/v1/inventory/anomalies')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(isolated.body).toEqual({ anomalies: [], total: 0 });
  });

  it('lists, filters, and generates tenant inventory alerts with ledger events', async () => {
    const expirationDate = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, sku: 'SKU-ALERT', quantity: 2, expirationDate })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/inventory/alerts?type=expiring_soon&severity=error')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      total: 1,
      alerts: [expect.objectContaining({ itemId: created.body.id, type: 'expiring_soon', severity: 'error' })],
    });

    const generated = await request(app.getHttpServer())
      .post('/api/v1/inventory/alerts/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(generated.body.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: created.body.id, type: 'low_stock' }),
      expect.objectContaining({ itemId: created.body.id, type: 'expiring_soon' }),
    ]));

    const events = await dataSource.query(
      `SELECT payload->>'action' AS action FROM ledger_events
       WHERE subject_id = $1 AND payload->>'action' IN ($2, $3)`,
      [created.body.id, InventoryLedgerEventAction.INVENTORY_LOW_STOCK, InventoryLedgerEventAction.INVENTORY_EXPIRING_SOON],
    );
    expect(events.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        InventoryLedgerEventAction.INVENTORY_LOW_STOCK,
        InventoryLedgerEventAction.INVENTORY_EXPIRING_SOON,
      ]),
    );

    const isolated = await request(app.getHttpServer())
      .get('/api/v1/inventory/alerts')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(isolated.body).toEqual({ alerts: [], total: 0 });
  });
});
