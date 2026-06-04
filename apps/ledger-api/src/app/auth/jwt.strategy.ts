import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requiredEnv } from '../config/required-env';
import { JwtPayload } from './auth.dto';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tokenBlacklistService: TokenBlacklistService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredEnv('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.actorType || !payload.tenantId || payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.jti && (await this.tokenBlacklistService.isJtiBlacklisted(payload.jti))) {
      throw new UnauthorizedException('Token revoked');
    }

    return {
      userId: payload.sub,
      username: payload.username ?? payload.sub,
      actorType: payload.actorType,
      tenantId: payload.tenantId,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
    };
  }
}
