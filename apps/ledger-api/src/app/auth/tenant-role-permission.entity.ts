import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tenant_role_permissions')
@Index(['tenantId', 'role'], { unique: true })
export class TenantRolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'tenant_id',
    type: 'uuid',
  })
  tenantId!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  role!: string;

  @Column({
    type: 'jsonb',
  })
  permissions!: string[];
}
