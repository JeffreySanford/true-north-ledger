import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { TokenAuthGuard } from './token-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { ServiceTokenStrategy } from './service-token.strategy';
import { ServiceAuthGuard } from './service-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LedgerEventsModule } from '../ledger-events/ledger-events.module';
import { requiredEnv } from '../config/required-env';
import { ServiceTokenEntity } from './service-token.entity';
import { TenantRolePermissionEntity } from './tenant-role-permission.entity';
import { UserRoleRecordEntity } from './user-role-record.entity';
import { TokenBlacklistService } from './token-blacklist.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([ServiceTokenEntity, TenantRolePermissionEntity, UserRoleRecordEntity]),
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: { expiresIn: '1h' },
    }),
    forwardRef(() => LedgerEventsModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ServiceTokenStrategy,
    JwtAuthGuard,
    ServiceAuthGuard,
    PermissionsGuard,
    TenantGuard,
    TokenAuthGuard,
    RateLimitGuard,
    TokenBlacklistService,
  ],
  exports: [
    PassportModule,
    JwtModule,
    PermissionsGuard,
    TenantGuard,
    AuthService,
    TokenAuthGuard,
    JwtAuthGuard,
    ServiceAuthGuard,
    RateLimitGuard,
    TokenBlacklistService,
  ],
})
export class AuthModule {}
