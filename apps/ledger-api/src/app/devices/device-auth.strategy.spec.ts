import { UnauthorizedException } from '@nestjs/common';
import { DeviceAuthStrategy, DeviceAuthRequest } from './device-auth.strategy';
import type { DevicesService, DeviceActor } from './devices.service';

describe('DeviceAuthStrategy', () => {
  const actor: DeviceActor = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    actorType: 'device',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    deviceId: '550e8400-e29b-41d4-a716-446655440000',
    deviceType: 'scanner',
  };

  const validateDeviceKey = jest.fn();
  let strategy: DeviceAuthStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    validateDeviceKey.mockResolvedValue(actor);
    strategy = new DeviceAuthStrategy({ validateDeviceKey } as unknown as DevicesService);
  });

  it('validates a device key and attaches device actor context', async () => {
    const request: DeviceAuthRequest = {
      headers: {
        'x-device-key': 'tnl_dev_key',
        'user-agent': 'device-suite',
        'x-correlation-id': 'corr-1',
      },
      ip: '127.0.0.1',
    };

    await expect(strategy.authenticate(request)).resolves.toEqual(actor);

    expect(validateDeviceKey).toHaveBeenCalledWith('tnl_dev_key', {
      sourceIp: '127.0.0.1',
      userAgent: 'device-suite',
      correlationId: 'corr-1',
    });
    expect(request.user).toEqual(actor);
    expect(request.tenantId).toBe(actor.tenantId);
    expect(request.deviceId).toBe(actor.deviceId);
  });

  it('uses the first repeated device key header value', async () => {
    const request: DeviceAuthRequest = {
      headers: {
        'x-device-key': ['tnl_dev_first', 'tnl_dev_second'],
        'user-agent': ['first-agent', 'second-agent'],
        'x-correlation-id': ['corr-first', 'corr-second'],
      },
    };

    await expect(strategy.authenticate(request)).resolves.toEqual(actor);

    expect(validateDeviceKey).toHaveBeenCalledWith('tnl_dev_first', {
      sourceIp: undefined,
      userAgent: 'first-agent',
      correlationId: 'corr-first',
    });
  });

  it('rejects missing device keys through the device service', async () => {
    validateDeviceKey.mockRejectedValueOnce(new UnauthorizedException('Missing device API key'));
    const request: DeviceAuthRequest = { headers: {} };

    await expect(strategy.authenticate(request)).rejects.toThrow('Missing device API key');
    expect(request.user).toBeUndefined();
    expect(request.tenantId).toBeUndefined();
    expect(request.deviceId).toBeUndefined();
  });

  it('rejects revoked or suspended devices through the device service', async () => {
    validateDeviceKey.mockRejectedValueOnce(new UnauthorizedException('Device is not allowed to authenticate'));
    const request: DeviceAuthRequest = {
      headers: {
        'x-device-key': 'tnl_dev_blocked',
      },
    };

    await expect(strategy.authenticate(request)).rejects.toThrow('Device is not allowed to authenticate');
  });
});
