import { Injectable } from '@nestjs/common';
import { DevicesService, DeviceActor } from './devices.service';

export interface DeviceAuthRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: DeviceActor;
  tenantId?: string;
  deviceId?: string;
}

@Injectable()
export class DeviceAuthStrategy {
  constructor(private readonly devicesService: DevicesService) {}

  async authenticate(request: DeviceAuthRequest): Promise<DeviceActor> {
    const deviceKey = this.extractDeviceKey(request);
    const actor = await this.devicesService.validateDeviceKey(deviceKey, {
      sourceIp: request.ip,
      userAgent: this.firstHeaderValue(request.headers?.['user-agent']),
      correlationId: this.firstHeaderValue(request.headers?.['x-correlation-id']),
    });

    request.user = actor;
    request.tenantId = actor.tenantId;
    request.deviceId = actor.deviceId;

    return actor;
  }

  private extractDeviceKey(request: DeviceAuthRequest): string | undefined {
    return this.firstHeaderValue(request.headers?.['x-device-key']);
  }

  private firstHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
