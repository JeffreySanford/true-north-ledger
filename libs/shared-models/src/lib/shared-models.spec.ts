import {
  AuthErrorSchema,
  CreateOrderRequestExample,
  CreateOrderRequestSchema,
  DeviceEventRequestSchema,
  DeviceHardwareExamples,
  DeviceRegistrationRequestSchema,
  DeviceTypeSchema,
  CreateInventoryItemRequestExample,
  CreateInventoryItemRequestSchema,
  InventoryItemExample,
  InventoryItemSchema,
  InventoryAnomalyListRequestSchema,
  InventoryAlertListResponseSchema,
  InventoryAnomalyListResponseSchema,
  InventoryBulkMoveRequestSchema,
  InventoryBulkMoveResponseSchema,
  InventoryExpiredReservationReleaseResponseSchema,
  InventoryImportRequestSchema,
  InventoryImportResponseSchema,
  InventoryLedgerEventActionSchema,
  InventoryMoveRequestSchema,
  InventoryOperationTypeSchema,
  InventoryProvenanceResponseSchema,
  InventoryQuantityAdjustmentRequestSchema,
  InventoryRemovalRequestSchema,
  InventoryScanRequestSchema,
  InventoryReservationReleaseRequestSchema,
  InventoryReservationRequestSchema,
  InventoryStatusChangeRequestSchema,
  InventoryStatusSchema,
  OrderExample,
  OrderLedgerEventActionSchema,
  OrderSchema,
  OrderStatusSchema,
  OrderStatusUpdateRequestSchema,
  OrderTimelineEventSchema,
  PermissionSchema,
  RateLimitErrorSchema,
  RoleSchema,
  ServiceTokenSchema,
  UserSchema,
} from './shared-models';

describe('shared-models', () => {
  it('accepts a valid service token payload', () => {
    const parsed = ServiceTokenSchema.parse({
      id: 'token-001',
      name: 'integration-token',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['ledger.read'],
      token: 'raw-token',
      createdAt: '2026-06-04T00:00:00.000Z',
      revoked: false,
    });

    expect(parsed.name).toBe('integration-token');
    expect(parsed.permissions).toEqual(['ledger.read']);
  });

  it('rejects service token payloads with invalid tenant ids', () => {
    expect(() =>
      ServiceTokenSchema.parse({
        id: 'token-001',
        name: 'integration-token',
        tenantId: 'tenant-1',
        permissions: ['ledger.read'],
        createdAt: '2026-06-04T00:00:00.000Z',
        revoked: false,
      }),
    ).toThrow();
  });

  it('parses a valid auth error payload', () => {
    const parsed = AuthErrorSchema.parse({
      statusCode: 401,
      message: 'Unauthorized',
      error: 'Unauthorized',
      code: 'AUTH_UNAUTHORIZED',
      details: { source: 'auth.interceptor' },
    });

    expect(parsed.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('parses a valid rate limit auth error payload', () => {
    const parsed = RateLimitErrorSchema.parse({
      statusCode: 429,
      message: 'Too many login attempts',
      error: 'Too Many Requests',
      code: 'AUTH_RATE_LIMITED',
      retryAfterSeconds: 60,
    });

    expect(parsed.statusCode).toBe(429);
    expect(parsed.code).toBe('AUTH_RATE_LIMITED');
  });

  it('rejects rate limit payloads with non-429 status codes', () => {
    expect(() =>
      RateLimitErrorSchema.parse({
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: 'AUTH_RATE_LIMITED',
      }),
    ).toThrow();
  });

  it('parses a valid role payload', () => {
    const parsed = RoleSchema.parse({
      name: 'operations_manager',
      permissions: ['ledger.read', 'orders.status.write'],
    });

    expect(parsed.name).toBe('operations_manager');
    expect(parsed.permissions).toContain('ledger.read');
  });

  it('rejects invalid permission dot-case values', () => {
    expect(() => PermissionSchema.parse('Ledger.Read')).toThrow();
  });

  it('parses a valid user payload', () => {
    const parsed = UserSchema.parse({
      userId: 'user-001',
      username: 'ops.manager',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      roles: ['operations_manager'],
      permissions: ['ledger.read', 'orders.status.write'],
      active: true,
    });

    expect(parsed.actorType).toBe('user');
    expect(parsed.roles).toEqual(['operations_manager']);
  });

  it('exports schema-valid hardware examples for every supported device type', () => {
    const expectedTypes = DeviceTypeSchema.options;
    const exampleEntries = Object.entries(DeviceHardwareExamples);

    expect(exampleEntries.map(([type]) => type).sort()).toEqual([...expectedTypes].sort());

    for (const [type, example] of exampleEntries) {
      const registration = DeviceRegistrationRequestSchema.parse(example.registration);
      const event = DeviceEventRequestSchema.parse(example.event);

      expect(registration.type).toBe(type);
      expect(registration.permissions).toContain('device.heartbeat.write');
      expect(registration.permissions).toContain('device.events.write');
      expect(event.eventType).toMatch(/^[a-z]+(?:\.[a-z]+)+$/);
      expect(event.payload).not.toEqual({});
      expect(example.useCase.length).toBeGreaterThan(20);
    }
  });

  it('keeps hardware example nonces unique for replay-safe documentation', () => {
    const nonces = Object.values(DeviceHardwareExamples).map((example) => example.event.nonce);

    expect(new Set(nonces).size).toBe(nonces.length);
  });

  it('exports schema-valid order examples for Sprint 3 API documentation', () => {
    const request = CreateOrderRequestSchema.parse(CreateOrderRequestExample);
    const order = OrderSchema.parse(OrderExample);

    expect(request.items).toHaveLength(1);
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(order.correlationId).toMatch(/[0-9a-f-]{36}/);
    expect(order.totalAmount).toBe(
      order.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0),
    );
  });

  it('defines the order lifecycle and ledger actions required by the PI plan', () => {
    expect(OrderStatusSchema.options).toEqual([
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'failed',
    ]);
    expect(OrderLedgerEventActionSchema.options).toEqual(
      expect.arrayContaining([
        'ORDER_CREATED',
        'ORDER_STATUS_CHANGED',
        'ORDER_CONFIRMED',
        'ORDER_PROCESSING',
        'ORDER_SHIPPED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
      ]),
    );
  });

  it('validates order status update reasons and rejects malformed targets', () => {
    expect(OrderStatusUpdateRequestSchema.parse({ status: 'confirmed', reason: 'customer approved' })).toEqual({
      status: 'confirmed',
      reason: 'customer approved',
    });
    expect(() => OrderStatusUpdateRequestSchema.parse({ status: 'draft' })).toThrow();
  });

  it('requires customer identity in order timeline actor metadata', () => {
    const event = OrderTimelineEventSchema.parse({
      eventId: '55555555-5555-4555-8555-555555555555',
      eventType: 'ORDER_CREATED',
      orderId: OrderExample.id,
      orderNumber: OrderExample.orderNumber,
      correlationId: OrderExample.correlationId,
      actorMetadata: { customerId: OrderExample.customerId },
      status: 'pending',
      actorType: 'user',
      actorId: 'admin',
      result: 'accepted',
      timestamp: OrderExample.createdAt,
    });

    expect(event.actorMetadata.customerId).toBe(OrderExample.customerId);
    expect(() =>
      OrderTimelineEventSchema.parse({ ...event, actorMetadata: {} }),
    ).toThrow();
  });

  it('exports schema-valid Sprint 4 inventory examples and lifecycle values', () => {
    const request = CreateInventoryItemRequestSchema.parse(CreateInventoryItemRequestExample);
    const item = InventoryItemSchema.parse(InventoryItemExample);

    expect(request.sku).toBe('SKU-100');
    expect(item.status).toBe('available');
    expect(item.locationId).toBe(request.locationId);
    expect(InventoryStatusSchema.options).toEqual([
      'available',
      'reserved',
      'in_transit',
      'damaged',
      'expired',
      'removed',
    ]);
    expect(InventoryLedgerEventActionSchema.options).toContain('INVENTORY_ADDED');
    expect(InventoryOperationTypeSchema.options).toEqual(expect.arrayContaining([
      'adjust_quantity',
      'change_status',
    ]));
  });

  it('normalizes inventory SKUs and rejects negative quantities', () => {
    expect(CreateInventoryItemRequestSchema.parse({
      ...CreateInventoryItemRequestExample,
      sku: ' sku-lower ',
    }).sku).toBe('SKU-LOWER');
    expect(() => CreateInventoryItemRequestSchema.parse({
      ...CreateInventoryItemRequestExample,
      quantity: -1,
    })).toThrow();
  });

  it('validates inventory reservation and release contracts', () => {
    expect(InventoryReservationRequestSchema.parse({
      quantity: 5,
      orderId: '77777777-7777-4777-8777-777777777777',
      timeoutMinutes: 30,
    })).toEqual({
      quantity: 5,
      orderId: '77777777-7777-4777-8777-777777777777',
      timeoutMinutes: 30,
    });
    expect(InventoryReservationReleaseRequestSchema.parse({ reason: 'Order cancelled' })).toEqual({
      reason: 'Order cancelled',
    });
    expect(() => InventoryReservationRequestSchema.parse({ quantity: 0 })).toThrow();
    expect(() => InventoryReservationRequestSchema.parse({ quantity: 1, timeoutMinutes: 0 })).toThrow();
    expect(InventoryExpiredReservationReleaseResponseSchema.parse({
      released: [InventoryItemExample],
      total: 1,
    })).toEqual({
      released: [InventoryItemExample],
      total: 1,
    });
  });

  it('validates inventory movement destinations', () => {
    expect(InventoryMoveRequestSchema.parse({
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
      reason: 'Cycle count',
    })).toEqual({
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
      reason: 'Cycle count',
    });
    expect(() => InventoryMoveRequestSchema.parse({ locationId: '', locationName: '' })).toThrow();
  });

  it('validates inventory bulk movement contracts', () => {
    const request = InventoryBulkMoveRequestSchema.parse({
      itemIds: [
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666',
      ],
      locationId: 'AUSTIN-C3',
      locationName: 'Austin Warehouse - Aisle C3',
      reason: 'Bulk aisle rebalance',
    });
    expect(request.itemIds).toHaveLength(2);
    expect(() => InventoryBulkMoveRequestSchema.parse({
      itemIds: [],
      locationId: 'AUSTIN-C3',
      locationName: 'Austin Warehouse - Aisle C3',
    })).toThrow();

    const response = InventoryBulkMoveResponseSchema.parse({
      results: [
        { index: 0, itemId: request.itemIds[0], success: true, item: InventoryItemExample },
        { index: 1, itemId: request.itemIds[1], success: false, error: 'Inventory item not found' },
      ],
    });
    expect(response.results.map((result) => result.success)).toEqual([true, false]);
  });

  it('validates inventory batch import contracts', () => {
    const request = InventoryImportRequestSchema.parse({
      items: [
        {
          ...CreateInventoryItemRequestExample,
          sku: 'sku-import-1',
          name: 'Imported sensor one',
        },
      ],
    });
    expect(request.items[0].sku).toBe('SKU-IMPORT-1');
    expect(() => InventoryImportRequestSchema.parse({ items: [] })).toThrow();

    const response = InventoryImportResponseSchema.parse({
      results: [
        { index: 0, sku: 'SKU-IMPORT-1', success: true, item: { ...InventoryItemExample, sku: 'SKU-IMPORT-1' } },
        { index: 1, sku: 'SKU-100', success: false, error: 'Inventory SKU SKU-100 already exists for tenant' },
      ],
    });
    expect(response.results.map((result) => result.success)).toEqual([true, false]);
  });

  it('validates inventory quantity and status operation contracts', () => {
    expect(InventoryQuantityAdjustmentRequestSchema.parse({
      quantity: 18,
      reason: 'Cycle count reconciliation',
    })).toEqual({
      quantity: 18,
      reason: 'Cycle count reconciliation',
    });
    expect(InventoryStatusChangeRequestSchema.parse({
      status: 'damaged',
      reason: 'Quality hold',
    })).toEqual({
      status: 'damaged',
      reason: 'Quality hold',
    });
    expect(() => InventoryQuantityAdjustmentRequestSchema.parse({ quantity: -1, reason: 'Invalid' })).toThrow();
    expect(() => InventoryStatusChangeRequestSchema.parse({ status: 'quarantined', reason: 'Invalid' })).toThrow();
  });

  it('requires a reason for inventory removal', () => {
    expect(InventoryRemovalRequestSchema.parse({
      reason: 'Damaged beyond repair',
    })).toEqual({
      reason: 'Damaged beyond repair',
    });
    expect(() => InventoryRemovalRequestSchema.parse({ reason: '' })).toThrow();
  });

  it('validates inventory scans by SKU or serial value', () => {
    expect(InventoryScanRequestSchema.parse({
      value: ' SKU-100 ',
      scanType: 'barcode',
      locationId: 'AUSTIN-A1',
      sourceEventType: 'inventory.scan',
    })).toEqual({
      value: 'SKU-100',
      scanType: 'barcode',
      locationId: 'AUSTIN-A1',
      sourceEventType: 'inventory.scan',
    });
    expect(() => InventoryScanRequestSchema.parse({ value: '', scanType: 'camera' })).toThrow();
  });

  it('validates chronological inventory provenance responses', () => {
    const response = InventoryProvenanceResponseSchema.parse({
      item: InventoryItemExample,
      events: [{
        eventId: '66666666-6666-4666-8666-666666666666',
        action: 'INVENTORY_ADDED',
        actorType: 'user',
        actorId: 'inventory-admin',
        deviceId: null,
        deviceType: null,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 25,
        reservedQuantity: 0,
        details: { action: 'INVENTORY_ADDED' },
        timestamp: '2026-06-11T12:00:00.000Z',
        chainSequence: 1,
        eventHash: 'hash-1',
      }],
      reservationHistory: [],
      scanHistory: [],
    });
    expect(response.events[0].action).toBe('INVENTORY_ADDED');
  });

  it('validates inventory anomaly severity, status, and remediation', () => {
    expect(InventoryAnomalyListRequestSchema.parse({
      type: 'low_stock',
      severity: 'warning',
      detectedFrom: '2026-06-01',
      detectedTo: '2026-06-30',
    })).toEqual({
      type: 'low_stock',
      severity: 'warning',
      detectedFrom: '2026-06-01',
      detectedTo: '2026-06-30',
    });
    expect(() => InventoryAnomalyListRequestSchema.parse({
      detectedFrom: '2026-06-30',
      detectedTo: '2026-06-01',
    })).toThrow();
    expect(InventoryAnomalyListRequestSchema.parse({ type: 'quantity_discrepancy' })).toEqual({
      type: 'quantity_discrepancy',
    });

    const response = InventoryAnomalyListResponseSchema.parse({
      anomalies: [{
        id: `${InventoryItemExample.id}:low_stock`,
        itemId: InventoryItemExample.id,
        sku: InventoryItemExample.sku,
        name: InventoryItemExample.name,
        type: 'low_stock',
        severity: 'warning',
        status: 'open',
        message: 'Stock is below threshold.',
        locationId: InventoryItemExample.locationId,
        locationName: InventoryItemExample.locationName,
        detectedAt: InventoryItemExample.updatedAt,
        remediation: 'Replenish inventory.',
        details: { quantity: 2, minimumQuantity: 5 },
      }],
      total: 1,
    });
    expect(response.anomalies[0]).toMatchObject({ severity: 'warning', status: 'open' });
  });

  it('validates inventory alert type, severity, and action', () => {
    const response = InventoryAlertListResponseSchema.parse({
      alerts: [{
        id: `${InventoryItemExample.id}:low_stock:low_stock`,
        itemId: InventoryItemExample.id,
        sku: InventoryItemExample.sku,
        name: InventoryItemExample.name,
        type: 'low_stock',
        severity: 'warning',
        message: 'Stock is below threshold.',
        locationId: InventoryItemExample.locationId,
        locationName: InventoryItemExample.locationName,
        createdAt: InventoryItemExample.updatedAt,
        action: 'Replenish inventory.',
        details: { quantity: 2, minimumQuantity: 5 },
      }],
      total: 1,
    });
    expect(response.alerts[0]).toMatchObject({ type: 'low_stock', action: 'Replenish inventory.' });
  });
});
