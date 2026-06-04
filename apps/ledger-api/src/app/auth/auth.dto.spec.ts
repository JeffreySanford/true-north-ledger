import {
  AuthResponseSchema,
  JwtPayloadSchema,
  LoginRequestSchema,
  ServiceTokenCreateRequestSchema,
  UserRoleAssignmentRequestSchema,
} from './auth.dto';

describe('auth DTO contracts', () => {
  it('accepts valid login requests', () => {
    const parsed = LoginRequestSchema.safeParse({ username: 'admin', password: 'admin' });

    expect(parsed.success).toBe(true);
  });

  it('rejects service token create requests without permissions', () => {
    const parsed = ServiceTokenCreateRequestSchema.safeParse({
      name: 'svc-token',
      permissions: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects invalid permission combinations for service token requests', () => {
    const parsed = ServiceTokenCreateRequestSchema.safeParse({
      name: 'svc-token',
      permissions: ['ledger.write'],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain('Permission ledger.write requires ledger.read');
    }
  });

  it('accepts valid permission combinations for service token requests', () => {
    const parsed = ServiceTokenCreateRequestSchema.safeParse({
      name: 'svc-token',
      permissions: ['ledger.read', 'ledger.write', 'inventory.read', 'inventory.scan.write'],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects duplicate permissions in auth response payloads', () => {
    const parsed = AuthResponseSchema.safeParse({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['ledger.read', 'ledger.read'],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('requires known role names in role assignment requests', () => {
    const parsed = UserRoleAssignmentRequestSchema.safeParse({
      roles: ['viewer', 'not-a-real-role'],
    });

    expect(parsed.success).toBe(false);
  });

  it('validates JWT payload token type and jti shape', () => {
    const invalid = JwtPayloadSchema.safeParse({
      sub: 'user-1',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      tokenType: 'access',
      jti: 'not-a-uuid',
    });

    expect(invalid.success).toBe(false);
  });

  it('accepts auth responses returned by login', () => {
    const parsed = AuthResponseSchema.safeParse({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['admin', 'ledger.read'],
      },
    });

    expect(parsed.success).toBe(true);
  });
});
