import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import type { RateLimitOptions } from './rate-limit.decorator';
import type { LedgerEventsService } from '../ledger-events/ledger-events.service';
import { RateLimitGuard } from './rate-limit.guard';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

describe('RateLimitGuard', () => {
  const originalMax = process.env.LEDGER_RATE_LIMIT_MAX;
  const originalWindow = process.env.LEDGER_RATE_LIMIT_WINDOW_MS;
  const ledgerEventsService: Pick<LedgerEventsService, 'appendEvent'> = {
    appendEvent: jest.fn().mockReturnValue(of({})),
  };
  const reflector = {
    getAllAndOverride: jest.fn<RateLimitOptions | undefined, [unknown, unknown[]]>(),
  };
  const throttlerStorage = {
    increment: jest.fn<Promise<ThrottlerStorageRecord>, [string, number, number, number, string]>(),
    reset: jest.fn<void, []>(),
  };

  afterEach(() => {
    process.env.LEDGER_RATE_LIMIT_MAX = originalMax;
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = originalWindow;
    jest.clearAllMocks();
  });

  function context(
    method: string,
    overrides: Partial<{
      url: string;
      path: string;
      routePath: string;
      user: { userId: string; actorType: string; tenantId: string };
      forwardedFor: string;
      ip: string;
    }> = {},
  ): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          tenantId: 'tenant-1',
          url: overrides.url ?? '/api/v1/ledger/events',
          path: overrides.path,
          route: overrides.routePath ? { path: overrides.routePath } : undefined,
          headers: {
            'user-agent': 'jest',
            'x-correlation-id': 'corr-1',
            ...(overrides.forwardedFor ? { 'x-forwarded-for': overrides.forwardedFor } : {}),
          },
          ip: overrides.ip ?? '127.0.0.1',
          user: overrides.user ?? {
            userId: 'actor-1',
            actorType: 'user',
            tenantId: 'tenant-1',
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('does not rate-limit reads', async () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);

    await expect(guard.canActivate(context('GET'))).resolves.toBe(true);
    await expect(guard.canActivate(context('GET'))).resolves.toBe(true);
    expect(throttlerStorage.increment).not.toHaveBeenCalled();
  });

  it('allows writes again after the rate limit window resets', async () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '10';
    reflector.getAllAndOverride.mockReturnValue(undefined);
    throttlerStorage.increment
      .mockResolvedValueOnce({ totalHits: 1, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 })
      .mockResolvedValueOnce({ totalHits: 2, timeToExpire: 1, isBlocked: true, timeToBlockExpire: 1 })
      .mockResolvedValueOnce({ totalHits: 1, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 });
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);

    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
    await expect(guard.canActivate(context('POST'))).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
  });

  it('rejects writes over the tenant actor limit', async () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '60000';
    reflector.getAllAndOverride.mockReturnValue(undefined);
    throttlerStorage.increment
      .mockResolvedValueOnce({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
      .mockResolvedValueOnce({ totalHits: 2, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 })
      .mockResolvedValueOnce({ totalHits: 2, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 });
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);

    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
    await expect(guard.canActivate(context('POST'))).rejects.toBeInstanceOf(HttpException);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEDGER_EVENT',
        subjectType: 'auth',
        payload: expect.objectContaining({ action: 'RATE_LIMIT_EXCEEDED', method: 'POST' }),
      }),
      expect.objectContaining({ userId: 'actor-1', actorType: 'user', tenantId: 'tenant-1' }),
      'tenant-1',
      expect.any(Object),
    );
    await expect(guard.canActivate(context('POST'))).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('honors endpoint-specific rate limit metadata', async () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '10000';
    reflector.getAllAndOverride.mockReturnValue({ maxRequests: 2, windowMs: 1000 });
    throttlerStorage.increment
      .mockResolvedValueOnce({ totalHits: 1, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 })
      .mockResolvedValueOnce({ totalHits: 2, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 })
      .mockResolvedValueOnce({ totalHits: 3, timeToExpire: 1, isBlocked: true, timeToBlockExpire: 1 });
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);

    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
    await expect(guard.canActivate(context('POST'))).rejects.toBeInstanceOf(HttpException);
    expect(throttlerStorage.increment).toHaveBeenCalledWith(
      'default:tenant-1:user:actor-1:POST:/api/v1/ledger/events:127.0.0.1',
      1000,
      2,
      1000,
      'route-limit',
    );
  });

  it('separates route buckets and ignores IP for device actors', async () => {
    reflector.getAllAndOverride.mockReturnValue({ maxRequests: 1, windowMs: 60_000 });
    throttlerStorage.increment.mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);
    const deviceUser = {
      userId: 'device-1',
      actorType: 'device',
      tenantId: 'tenant-1',
    };

    await expect(
      guard.canActivate(
        context('POST', {
          url: '/api/v1/devices/heartbeat',
          user: deviceUser,
          forwardedFor: '10.10.10.10',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        context('POST', {
          url: '/api/v1/device-events',
          user: deviceUser,
          forwardedFor: '10.10.10.11',
        }),
      ),
    ).resolves.toBe(true);

    expect(throttlerStorage.increment).toHaveBeenNthCalledWith(
      1,
      'default:tenant-1:device:device-1:POST:/api/v1/devices/heartbeat:device',
      60_000,
      1,
      60_000,
      'route-limit',
    );
    expect(throttlerStorage.increment).toHaveBeenNthCalledWith(
      2,
      'default:tenant-1:device:device-1:POST:/api/v1/device-events:device',
      60_000,
      1,
      60_000,
      'route-limit',
    );
  });

  it('delegates reset to throttler storage when available', () => {
    const guard = new RateLimitGuard(reflector as never, ledgerEventsService as never, throttlerStorage as never);

    guard.reset();

    expect(throttlerStorage.reset).toHaveBeenCalledTimes(1);
  });
});
