import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { requiredEnv } from '../config/required-env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [JwtStrategy, PermissionsGuard, TenantGuard],
  exports: [PassportModule, JwtModule, PermissionsGuard, TenantGuard],
})
export class AuthModule {}
