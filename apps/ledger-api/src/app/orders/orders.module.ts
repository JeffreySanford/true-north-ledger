import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEventsModule } from '../ledger-events/ledger-events.module';
import { LedgerEventEntity } from '../ledger-events/ledger-event.entity';
import { AuthModule } from '../auth/auth.module';
import { OrderEntity } from './order.entity';
import { OrdersController, ProofsController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, LedgerEventEntity]),
    AuthModule,
    LedgerEventsModule,
  ],
  controllers: [OrdersController, ProofsController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService],
})
export class OrdersModule {}
