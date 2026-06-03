import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LedgerEventsModule } from './ledger-events/ledger-events.module';
import { typeOrmConfig } from './typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' 
        ? '.env.production' 
        : '.env.development',
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    LedgerEventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
