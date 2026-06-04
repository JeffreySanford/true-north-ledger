import { TokenBlacklistService } from './token-blacklist.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let now: number;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const redisClient = {
      isOpen: false,
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      quit: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      exists: jest.fn(),
    };
    service = new TokenBlacklistService();
    service.setClientFactoryForTesting(() => redisClient as never);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('blacklists a jti in local fallback store', async () => {
    await service.blacklistJti('jti-1', 60);

    await expect(service.isJtiBlacklisted('jti-1')).resolves.toBe(true);
  });

  it('expires local fallback blacklist entries', async () => {
    await service.blacklistJti('jti-2', 1);

    now += 1100;
    await expect(service.isJtiBlacklisted('jti-2')).resolves.toBe(false);
  });
});
