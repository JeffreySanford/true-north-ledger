import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LedgerEventsService } from '../ledger-events/ledger-events.service';
import type { AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly ledgerEventsService: LedgerEventsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; actorType?: string; tenantId?: string };
      tenantId?: string;
      headers?: Record<string, string | string[] | undefined>;
      url?: string;
      ip?: string;
    }>();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const requestedTenantId = this.getRequestedTenantId(request.headers);
    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      this.appendTenantIsolationViolationEvent(request, requestedTenantId, user);
      throw new ForbiddenException('Tenant isolation violation');
    }

    // Attach tenant to request for downstream use
    request.tenantId = user.tenantId;

    return true;
  }

  private getRequestedTenantId(headers: Record<string, string | string[] | undefined> | undefined): string | null {
    const raw = headers?.['x-tenant-id'] ?? headers?.['x-tenantid'];
    if (!raw) {
      return null;
    }

    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }

    return raw;
  }

  private appendTenantIsolationViolationEvent(
    request: {
      url?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    requestedTenantId: string,
    user: { userId?: string; actorType?: string; tenantId?: string },
  ): void {
    const actor: AuthenticatedLedgerActor = {
      userId: user.userId ?? 'unknown',
      actorType: user.actorType ?? 'user',
      tenantId: user.tenantId ?? 'unknown',
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: actor.userId,
          payload: {
            action: 'TENANT_ISOLATION_VIOLATION',
            requestedTenantId,
            actorTenantId: actor.tenantId,
            path: request.url ?? 'unknown',
          },
        },
        actor,
        actor.tenantId,
        {
          sourceIp: request.ip,
          userAgent: request.headers?.['user-agent'],
          correlationId: request.headers?.['x-correlation-id'],
        },
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record tenant isolation violation event', error);
          }
        },
      });
  }
}
