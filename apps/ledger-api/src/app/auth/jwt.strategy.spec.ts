import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayload } from './auth.dto';
import { TokenBlacklistService } from './token-blacklist.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
    tokenBlacklistService = {
      blacklistJti: jest.fn(),
      isJtiBlacklisted: jest.fn().mockResolvedValue(false),
      onModuleDestroy: jest.fn(),
    } as unknown as jest.Mocked<TokenBlacklistService>;
    strategy = new JwtStrategy(tokenBlacklistService);
  });

  it('returns an authenticated user when payload is valid', async () => {
    const payload: JwtPayload = {
      sub: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      roles: ['auditor'],
      permissions: ['read', 'write'],
      tokenType: 'access',
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      userId: 'test-user',
      username: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      roles: ['auditor'],
      permissions: ['read', 'write'],
    });
  });

  it('returns an authenticated user with default permissions when none are provided', async () => {
    const payload: JwtPayload = {
      sub: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      tokenType: 'access',
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      userId: 'test-user',
      username: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      roles: [],
      permissions: [],
    });
  });

  it('throws UnauthorizedException when payload is missing sub', async () => {
    const payload = {
      actorType: 'user',
      tenantId: 'tenant-123',
      permissions: ['read'],
      tokenType: 'access',
    } as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when payload is missing actorType', async () => {
    const payload = {
      sub: 'test-user',
      tenantId: 'tenant-123',
      permissions: ['read'],
      tokenType: 'access',
    } as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when payload is missing tenantId', async () => {
    const payload = {
      sub: 'test-user',
      actorType: 'user',
      permissions: ['read'],
      tokenType: 'access',
    } as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for revoked tokens', async () => {
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(true);

    const payload: JwtPayload = {
      sub: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      tokenType: 'access',
      jti: 'revoked-jti',
    };

    await expect(strategy.validate(payload)).rejects.toThrow('Token revoked');
  });
});
