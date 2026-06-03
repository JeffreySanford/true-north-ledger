import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEventsController } from './ledger-events.controller';
import { LedgerEventsService } from './ledger-events.service';
import { LedgerEventEntity } from './ledger-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEventEntity])],
  controllers: [LedgerEventsController],
  providers: [LedgerEventsService],
  exports: [LedgerEventsService],
})
export class LedgerEventsModule {}
