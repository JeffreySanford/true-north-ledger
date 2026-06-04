import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('falls back to local in-memory counters when Redis is unavailable', async () => {
    const failingClient = {
      isOpen: false,
      connect: jest.fn().mockRejectedValue(new Error('unavailable')),
      quit: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      pExpire: jest.fn(),
      pTTL: jest.fn(),
      set: jest.fn(),
    };

    const storage = new RedisThrottlerStorage('redis://unavailable', () => failingClient as never);

    const first = await storage.increment('tenant:user:actor', 1000, 1, 1000, 'default');
    const second = await storage.increment('tenant:user:actor', 1000, 1, 1000, 'default');

    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(true);
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
  });

  it('uses Redis counters and block keys when Redis is available', async () => {
    let hits = 0;
    let blockExpiresAt = 0;
    let counterExpiresAt = 0;

    const redisClient = {
      isOpen: false,
      connect: jest.fn().mockImplementation(function connect(this: { isOpen: boolean }) {
        this.isOpen = true;
        return Promise.resolve();
      }),
      quit: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockImplementation((key: string) => {
        if (key.endsWith(':block')) {
          return Promise.resolve(Date.now() < blockExpiresAt ? 1 : 0);
        }
        return Promise.resolve(hits > 0 ? 1 : 0);
      }),
      incr: jest.fn().mockImplementation(() => {
        hits += 1;
        return Promise.resolve(hits);
      }),
      pExpire: jest.fn().mockImplementation((_key: string, ms: number) => {
        counterExpiresAt = Date.now() + ms;
        return Promise.resolve(1);
      }),
      pTTL: jest.fn().mockImplementation((key: string) => {
        if (key.endsWith(':block')) {
          return Promise.resolve(Math.max(0, blockExpiresAt - Date.now()));
        }
        return Promise.resolve(Math.max(0, counterExpiresAt - Date.now()));
      }),
      set: jest.fn().mockImplementation((_key: string, _value: string, options: { PX: number }) => {
        blockExpiresAt = Date.now() + options.PX;
        return Promise.resolve('OK');
      }),
    };

    const storage = new RedisThrottlerStorage('redis://ok', () => redisClient as never);

    const first = await storage.increment('tenant:user:actor', 1000, 1, 1000, 'default');
    const second = await storage.increment('tenant:user:actor', 1000, 1, 1000, 'default');

    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(true);
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
    expect(redisClient.set).toHaveBeenCalledTimes(1);

    await storage.onModuleDestroy();
    expect(redisClient.quit).toHaveBeenCalledTimes(1);
  });
});
