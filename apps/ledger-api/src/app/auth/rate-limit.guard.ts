import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly maxRequests = Number(process.env.LEDGER_RATE_LIMIT_MAX ?? 1000);
  private readonly windowMs = Number(process.env.LEDGER_RATE_LIMIT_WINDOW_MS ?? 60_000);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      tenantId?: string;
      user?: { userId?: string; sub?: string; actorType?: string };
    }>();

    if (!request.method || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const actorId = request.user?.userId ?? request.user?.sub ?? 'unknown';
    const actorType = request.user?.actorType ?? 'unknown';
    const tenantId = request.tenantId ?? 'unknown';
    const key = `${tenantId}:${actorType}:${actorId}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxRequests) {
      throw new HttpException('Ledger write rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    return true;
  }
}
