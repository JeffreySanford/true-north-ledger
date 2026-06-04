import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthUser, JwtPayload } from './auth.dto';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers?.authorization;

    if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice(7).trim();
    const user = await this.authenticate(token);

    request.user = user;
    request.tenantId = user.tenantId;

    return true;
  }

  private async authenticate(token: string): Promise<AuthUser> {
    const jwtUser = await this.tryVerifyJwt(token);
    if (jwtUser) {
      return jwtUser;
    }

    return this.authService.verifyServiceToken(token);
  }

  private async tryVerifyJwt(token: string): Promise<AuthUser | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (payload.tokenType !== 'access') {
        return null;
      }

      if (!payload.sub || !payload.actorType || !payload.tenantId) {
        return null;
      }

      if (payload.jti && (await this.tokenBlacklistService.isJtiBlacklisted(payload.jti))) {
        throw new UnauthorizedException('Token revoked');
      }

      return {
        userId: payload.sub,
        username: payload.username ?? payload.sub,
        actorType: payload.actorType,
        tenantId: payload.tenantId,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      return null;
    }
  }
}
