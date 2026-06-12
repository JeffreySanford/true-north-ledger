import {
  AuthErrorSchema,
  CreateOrderRequestExample,
  CreateOrderRequestSchema,
  DeviceEventRequestSchema,
  DeviceHardwareExamples,
  DeviceRegistrationRequestSchema,
  DeviceTypeSchema,
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
});
