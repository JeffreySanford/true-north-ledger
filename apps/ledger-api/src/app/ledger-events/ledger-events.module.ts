import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEventsController } from './ledger-events.controller';
import { LedgerEventsService } from './ledger-events.service';
import { LedgerEventEntity } from './ledger-event.entity';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEventEntity]),
    forwardRef(() => AuthModule),
    NotificationsModule,
  ],
  controllers: [LedgerEventsController],
  providers: [LedgerEventsService, RateLimitGuard],
  exports: [LedgerEventsService],
})
export class LedgerEventsModule {}
