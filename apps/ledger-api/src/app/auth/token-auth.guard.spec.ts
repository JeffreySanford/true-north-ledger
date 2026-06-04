import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TokenAuthGuard } from './token-auth.guard';
import type { ExecutionContext } from '@nestjs/common';
import { TokenBlacklistService } from './token-blacklist.service';

describe('TokenAuthGuard', () => {
  interface GuardRequest {
    headers: { authorization?: string };
    user?: unknown;
    tenantId?: string;
  }

  let guard: TokenAuthGuard;
  const mockJwtService = { verify: jest.fn() };
  const mockAuthService = { verifyServiceToken: jest.fn() };
  const mockTokenBlacklistService = { isJtiBlacklisted: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    guard = new TokenAuthGuard(
      mockJwtService as unknown as JwtService,
      mockAuthService as unknown as AuthService,
      mockTokenBlacklistService as unknown as TokenBlacklistService,
    );
  });

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('authenticates with a valid access JWT and attaches the user to the request', async () => {
    const request: GuardRequest = { headers: { authorization: 'Bearer valid-token' } };

    mockJwtService.verify.mockReturnValue({
      sub: 'test-user',
      username: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      roles: ['auditor'],
      permissions: ['read'],
      tokenType: 'access',
    });

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.user).toEqual({
      userId: 'test-user',
      username: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      roles: ['auditor'],
      permissions: ['read'],
    });
    expect(request.tenantId).toBe('tenant-123');
    expect(mockAuthService.verifyServiceToken).not.toHaveBeenCalled();
  });

  it('falls back to service token verification when JWT verification fails', async () => {
    const request: GuardRequest = { headers: { authorization: 'Bearer fallback-token' } };
    const serviceUser = {
      userId: 'service-1',
      username: 'service-app',
      actorType: 'service' as const,
      tenantId: 'tenant-123',
      permissions: ['read'],
    };

    mockJwtService.verify.mockImplementation(() => {
      throw new Error('Invalid token');
    });
    mockAuthService.verifyServiceToken.mockResolvedValue(serviceUser);

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.user).toEqual(serviceUser);
    expect(request.tenantId).toBe('tenant-123');
    expect(mockAuthService.verifyServiceToken).toHaveBeenCalledWith('fallback-token');
  });

  it('throws UnauthorizedException when the service token is invalid', async () => {
    const request: GuardRequest = { headers: { authorization: 'Bearer invalid-token' } };

    mockJwtService.verify.mockImplementation(() => {
      throw new Error('Invalid token');
    });
    mockAuthService.verifyServiceToken.mockRejectedValue(new UnauthorizedException('Invalid service token'));

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the Authorization header is missing', async () => {
    const request: GuardRequest = { headers: {} };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects revoked JWT access tokens', async () => {
    const request: GuardRequest = { headers: { authorization: 'Bearer revoked-token' } };

    mockJwtService.verify.mockReturnValue({
      sub: 'test-user',
      actorType: 'user',
      tenantId: 'tenant-123',
      permissions: ['read'],
      tokenType: 'access',
      jti: 'revoked-jti',
    });
    mockTokenBlacklistService.isJtiBlacklisted.mockResolvedValue(true);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow('Token revoked');
    expect(mockAuthService.verifyServiceToken).not.toHaveBeenCalled();
  });
});
