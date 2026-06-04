import { ServiceAuthGuard } from './service-auth.guard';

describe('ServiceAuthGuard', () => {
  it('is instantiable', () => {
    const guard = new ServiceAuthGuard();
    expect(guard).toBeInstanceOf(ServiceAuthGuard);
  });
});
