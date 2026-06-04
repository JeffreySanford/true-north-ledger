import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantRolePermissionEntity } from '../auth/tenant-role-permission.entity';
import { RolesService } from './roles.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantRolePermissionEntity])],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
