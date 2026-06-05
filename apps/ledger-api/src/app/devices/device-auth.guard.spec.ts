import type { ExecutionContext } from '@nestjs/common';
import { DeviceAuthGuard } from './device-auth.guard';
import type { DeviceAuthStrategy } from './device-auth.strategy';
import type { DeviceActor } from './devices.service';

describe('DeviceAuthGuard', () => {
  const actor: DeviceActor = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: 'device',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    deviceId: '550e8400-e29b-41d4-a716-446655440000',
    deviceType: 'scanner',
  };

  let guard: DeviceAuthGuard;
  const authenticate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue(actor);
    guard = new DeviceAuthGuard({ authenticate } as unknown as DeviceAuthStrategy);
  });

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('authenticates using x-device-key and attaches device actor context', async () => {
    const request: Record<string, unknown> = {
      headers: {
        'x-device-key': 'tnl_dev_key',
        'user-agent': 'device-suite',
        'x-correlation-id': 'corr-1',
      },
      ip: '127.0.0.1',
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(authenticate).toHaveBeenCalledWith(request);
  });

  it('bubbles authentication failures from the strategy', async () => {
    const error = new Error('Invalid device API key');
    authenticate.mockRejectedValueOnce(error);
    const request: Record<string, unknown> = { headers: {} };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(error);
  });
});
