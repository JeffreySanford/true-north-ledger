import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DevicesModule } from '../devices/devices.module';
import { LedgerEventsModule } from '../ledger-events/ledger-events.module';
import { InventoryController } from './inventory.controller';
import { InventoryItemEntity } from './inventory-item.entity';
import { InventoryScanAuthGuard } from './inventory-scan-auth.guard';
import { InventoryScanController } from './inventory-scan.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItemEntity]), AuthModule, forwardRef(() => DevicesModule), LedgerEventsModule],
  controllers: [InventoryController, InventoryScanController],
  providers: [InventoryService, InventoryScanAuthGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
