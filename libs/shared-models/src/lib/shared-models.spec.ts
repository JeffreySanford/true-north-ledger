import {
  AuthErrorSchema,
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
});
