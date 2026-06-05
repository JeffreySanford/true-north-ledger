import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DeviceAuthRequest, DeviceAuthStrategy } from './device-auth.strategy';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly deviceAuthStrategy: DeviceAuthStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceAuthRequest>();
    await this.deviceAuthStrategy.authenticate(request);

    return true;
  }
}
