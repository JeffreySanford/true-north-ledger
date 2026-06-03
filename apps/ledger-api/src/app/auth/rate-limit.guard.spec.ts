import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  const originalMax = process.env.LEDGER_RATE_LIMIT_MAX;
  const originalWindow = process.env.LEDGER_RATE_LIMIT_WINDOW_MS;

  afterEach(() => {
    process.env.LEDGER_RATE_LIMIT_MAX = originalMax;
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = originalWindow;
  });

  function context(method: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          tenantId: 'tenant-1',
          user: {
            userId: 'actor-1',
            actorType: 'user',
          },
        }),
      }),
    } as ExecutionContext;
  }

  it('does not rate-limit reads', () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    const guard = new RateLimitGuard();

    expect(guard.canActivate(context('GET'))).toBe(true);
    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('rejects writes over the tenant actor limit', () => {
    process.env.LEDGER_RATE_LIMIT_MAX = '1';
    process.env.LEDGER_RATE_LIMIT_WINDOW_MS = '60000';
    const guard = new RateLimitGuard();

    expect(guard.canActivate(context('POST'))).toBe(true);
    expect(() => guard.canActivate(context('POST'))).toThrow(HttpException);
    try {
      guard.canActivate(context('POST'));
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});
