import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LedgerEventsModule } from '../ledger-events/ledger-events.module';
import { DeviceEntity } from './device.entity';
import { DeviceNonceEntity } from './device-nonce.entity';
import { DeviceAuthGuard } from './device-auth.guard';
import { DeviceAuthStrategy } from './device-auth.strategy';
import { DeviceEventsController } from './device-events.controller';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity, DeviceNonceEntity]), AuthModule, LedgerEventsModule],
  controllers: [DevicesController, DeviceEventsController],
  providers: [DevicesService, DeviceAuthGuard, DeviceAuthStrategy],
  exports: [DevicesService, DeviceAuthStrategy],
})
export class DevicesModule {}
