import { ExecutionContext } from '@nestjs/common';
import { getTenantFromContext } from './tenant.decorator';

describe('Tenant decorator helper', () => {
  it('returns tenantId from the request object', () => {
    const request = { tenantId: 'tenant-123' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const tenantId = getTenantFromContext(context);

    expect(tenantId).toBe('tenant-123');
  });

  it('returns null when tenantId is missing', () => {
    const request = {};
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const tenantId = getTenantFromContext(context);

    expect(tenantId).toBeNull();
  });
});
