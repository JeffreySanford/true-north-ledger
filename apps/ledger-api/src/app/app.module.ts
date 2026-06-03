import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LedgerEventsModule } from './ledger-events/ledger-events.module';
import { AuthModule } from './auth/auth.module';
import { typeOrmConfig } from './typeorm.config';
import { ApiErrorFilter } from './errors/api-error.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' 
        ? '.env.production' 
        : '.env.development',
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    AuthModule,
    LedgerEventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiErrorFilter,
    },
  ],
})
export class AppModule {}
