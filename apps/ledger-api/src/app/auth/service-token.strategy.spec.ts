import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ServiceTokenStrategy } from './service-token.strategy';

describe('ServiceTokenStrategy', () => {
  const mockAuthService = {
    verifyServiceToken: jest.fn(),
  };

  let strategy: ServiceTokenStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new ServiceTokenStrategy(mockAuthService as unknown as AuthService);
  });

  it('validates a bearer token using auth service verification', async () => {
    const user = {
      userId: 'service-1',
      username: 'integration-service',
      actorType: 'service' as const,
      tenantId: '00000000-0000-0000-0000-000000000000',
      roles: [],
      permissions: ['ledger.read'],
    };
    mockAuthService.verifyServiceToken.mockResolvedValue(user);

    await expect(strategy.validate('service-bearer-token')).resolves.toEqual(user);
    expect(mockAuthService.verifyServiceToken).toHaveBeenCalledWith('service-bearer-token');
  });

  it('rejects revoked or invalid service tokens', async () => {
    mockAuthService.verifyServiceToken.mockRejectedValue(new UnauthorizedException('Invalid or revoked service token'));

    await expect(strategy.validate('revoked-token')).rejects.toThrow('Invalid or revoked service token');
  });
});
