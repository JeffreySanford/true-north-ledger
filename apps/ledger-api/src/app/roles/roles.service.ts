import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantRolePermissionEntity } from '../auth/tenant-role-permission.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(TenantRolePermissionEntity)
    private readonly tenantRolePermissionRepository: Repository<TenantRolePermissionEntity>,
  ) {}

  async listTenantRoleMappings(tenantId: string): Promise<TenantRolePermissionEntity[]> {
    return this.tenantRolePermissionRepository.find({ where: { tenantId } });
  }
}
