import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  LedgerEventsService,
  AuthenticatedLedgerActor,
} from '../ledger-events/ledger-events.service';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import { AuthService } from './auth.service';

interface GuardRequestUser {
  userId?: string;
  username?: string;
  actorType?: 'user' | 'service' | 'device' | 'system';
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
}

interface GuardRequest {
  user?: GuardRequestUser;
  tenantId?: string;
  url?: string;
  path?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ledgerEventsService: LedgerEventsService,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const user = request.user ?? {};
    const permissions = this.authService.resolvePermissionsForActor({
      userId: user.userId,
      username: user.username,
      actorType: user.actorType,
      tenantId: user.tenantId,
      roles: user.roles,
      permissions: user.permissions,
    });

    if (!this.authService.isActorActive({
      userId: user.userId,
      username: user.username,
      actorType: user.actorType,
      tenantId: user.tenantId,
    })) {
      this.appendPermissionDeniedEvent(request, requiredPermissions, permissions);
      throw new ForbiddenException('User is deactivated');
    }

    if (
      permissions.includes('admin') ||
      requiredPermissions.every((permission) => permissions.includes(permission))
    ) {
      return true;
    }

    this.appendPermissionDeniedEvent(request, requiredPermissions, permissions);
    throw new ForbiddenException('Required permission missing');
  }

  private appendPermissionDeniedEvent(
    request: GuardRequest,
    requiredPermissions: string[],
    actualPermissions: string[],
  ): void {
    const user = request.user ?? {};
    const actor: AuthenticatedLedgerActor = {
      userId: user.userId ?? 'unknown',
      actorType: user.actorType ?? 'system',
      tenantId: user.tenantId ?? request.tenantId ?? 'unknown',
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: actor.userId,
          payload: {
            action: AuthLedgerEventAction.PERMISSION_DENIED,
            requiredPermissions,
            actualPermissions,
            path: request.url ?? request.path,
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
            console.error('Failed to record permission denied event', error);
          }
        },
      });
  }
}
