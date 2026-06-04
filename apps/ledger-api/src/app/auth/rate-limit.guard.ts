import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import {
  LedgerEventsService,
  AuthenticatedLedgerActor,
} from '../ledger-events/ledger-events.service';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

interface RateLimitRequest {
  method?: string;
  tenantId?: string;
  user?: { userId?: string; sub?: string; actorType?: string; tenantId?: string };
  url?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultMaxRequests = Number(process.env.LEDGER_RATE_LIMIT_MAX ?? 1000);
  private readonly defaultWindowMs = Number(process.env.LEDGER_RATE_LIMIT_WINDOW_MS ?? 60_000);
  private static keyNamespace = 'default';

  constructor(
    private readonly reflector: Reflector,
    private readonly ledgerEventsService: LedgerEventsService,
    @InjectThrottlerStorage() private readonly throttlerStorage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();

    if (!request.method || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const maxRequests = rateLimitOptions?.maxRequests ?? this.defaultMaxRequests;
    const windowMs = rateLimitOptions?.windowMs ?? this.defaultWindowMs;

    const actorId = request.user?.userId ?? request.user?.sub ?? 'unknown';
    const actorType = request.user?.actorType ?? 'unknown';
    const tenantId = request.user?.tenantId ?? request.tenantId ?? 'unknown';
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const tracker = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : request.ip;
    const key = `${RateLimitGuard.keyNamespace}:${tenantId}:${actorType}:${actorId}:${tracker ?? 'unknown'}`;
    const result = await this.throttlerStorage.increment(key, windowMs, maxRequests, windowMs, 'route-limit');

    if (result.isBlocked) {
      this.appendRateLimitEvent(request, actorId, actorType, tenantId);
      throw new HttpException('Ledger write rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  reset(): void {
    RateLimitGuard.keyNamespace = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const maybeResettable = this.throttlerStorage as ThrottlerStorage & { reset?: () => void | Promise<void> };
    const resetResult = maybeResettable.reset?.();
    if (resetResult && typeof (resetResult as Promise<void>).then === 'function') {
      void resetResult;
    }
  }

  private appendRateLimitEvent(
    request: RateLimitRequest,
    actorId: string,
    actorType: string,
    tenantId: string,
  ): void {
    const actor: AuthenticatedLedgerActor = {
      userId: actorId,
      actorType,
      tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: actorId,
          payload: {
            action: AuthLedgerEventAction.RATE_LIMIT_EXCEEDED,
            path: request.url ?? request.path,
            method: request.method,
          },
        },
        actor,
        tenantId,
        {
          sourceIp: request.ip,
          userAgent: request.headers?.['user-agent'],
          correlationId: request.headers?.['x-correlation-id'],
        },
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record rate limit event', error);
          }
        },
      });
  }
}
