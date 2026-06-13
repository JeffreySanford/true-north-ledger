import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import { DeviceAuthRequest, DeviceAuthStrategy } from '../devices/device-auth.strategy';

interface ScanRequest {
  headers?: Record<string, string | string[] | undefined>;
  user?: { actorType?: string; permissions?: string[] };
}

@Injectable()
export class InventoryScanAuthGuard implements CanActivate {
  constructor(
    private readonly tokenAuthGuard: TokenAuthGuard,
    private readonly deviceAuthStrategy: DeviceAuthStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScanRequest>();
    if (request.headers?.['x-device-key']) {
      await this.deviceAuthStrategy.authenticate(request as DeviceAuthRequest);
      this.requirePermission(request, 'device.events.write');
      return true;
    }

    await this.tokenAuthGuard.canActivate(context);
    this.requirePermission(request, 'inventory.write');
    return true;
  }

  private requirePermission(request: ScanRequest, permission: string): void {
    if (!request.user?.permissions?.includes(permission)) {
      throw new ForbiddenException(`Caller lacks ${permission} permission`);
    }
  }
}
