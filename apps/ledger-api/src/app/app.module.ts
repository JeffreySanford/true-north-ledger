import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LedgerEventsModule } from './ledger-events/ledger-events.module';
import { AuthModule } from './auth/auth.module';
import { typeOrmConfig } from './typeorm.config';
import { ApiErrorFilter } from './errors/api-error.filter';
import { validateAuthEnv } from './config/auth-env.validation';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { RedisThrottlerStorage } from './auth/redis-throttler.storage';
import { DevicesModule } from './devices/devices.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env.production'
          : '.env.development',
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const defaultLimit = Number(
          process.env.LEDGER_GLOBAL_RATE_LIMIT_MAX ?? 100,
        );
        const defaultWindowMs = Number(
          process.env.LEDGER_GLOBAL_RATE_LIMIT_WINDOW_MS ?? 60_000,
        );
        const useRedisStorage =
          process.env.NODE_ENV !== 'test' && Boolean(process.env.REDIS_URL);

        return {
          throttlers: [
            {
              name: 'default',
              limit: defaultLimit,
              ttl: defaultWindowMs,
            },
          ],
          ...(useRedisStorage
            ? { storage: new RedisThrottlerStorage(process.env.REDIS_URL) }
            : {}),
        };
      },
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    AuthModule,
    LedgerEventsModule,
    UsersModule,
    RolesModule,
    DevicesModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiErrorFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  constructor() {
    validateAuthEnv();
  }
}
