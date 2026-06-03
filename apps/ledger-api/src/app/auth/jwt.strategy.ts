import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requiredEnv } from '../config/required-env';

export interface JwtPayload {
  sub: string; // user/service/device ID
  actorType: 'user' | 'service' | 'device' | 'system';
  tenantId: string;
  permissions?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredEnv('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.actorType || !payload.tenantId) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return {
      userId: payload.sub,
      actorType: payload.actorType,
      tenantId: payload.tenantId,
      permissions: payload.permissions || [],
    };
  }
}
