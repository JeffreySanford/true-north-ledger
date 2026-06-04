import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { AuthService } from './auth.service';

@Injectable()
export class ServiceTokenStrategy extends PassportStrategy(BearerStrategy, 'service') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(token: string) {
    return this.authService.verifyServiceToken(token);
  }
}
