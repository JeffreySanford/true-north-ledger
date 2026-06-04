import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantGuard } from './tenant.guard';
import type { ExecutionContext } from '@nestjs/common';
import type { LedgerEventsService } from '../ledger-events/ledger-events.service';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let ledgerEventsService: Pick<LedgerEventsService, 'appendEvent'>;

  beforeEach(() => {
    ledgerEventsService = {
      appendEvent: jest.fn().mockReturnValue(of({})),
    };
    guard = new TenantGuard(ledgerEventsService as LedgerEventsService);
  });

  function createContext(
    user: Record<string, unknown> | null,
    headers: Record<string, string | string[] | undefined> = {},
  ) {
    const request = { user, headers, url: '/api/v1/ledger/events', ip: '127.0.0.1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return { request, context };
  }

  it('attaches tenantId to the request when tenant data exists', () => {
    const { request, context } = createContext({ tenantId: 'tenant-123' });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.tenantId).toBe('tenant-123');
  });

  it('throws ForbiddenException when user tenant context is missing', () => {
    const { context } = createContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException and records TENANT_ISOLATION_VIOLATION when requested tenant differs', () => {
    const { context } = createContext(
      { userId: 'tenant-user-1', actorType: 'user', tenantId: 'tenant-123' },
      { 'x-tenant-id': 'tenant-999' },
    );

    expect(() => guard.canActivate(context)).toThrow('Tenant isolation violation');
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'TENANT_ISOLATION_VIOLATION',
          requestedTenantId: 'tenant-999',
          actorTenantId: 'tenant-123',
        }),
      }),
      expect.objectContaining({ userId: 'tenant-user-1', tenantId: 'tenant-123' }),
      'tenant-123',
      expect.any(Object),
    );
  });
});
