import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tenant_user_roles')
@Index(['tenantId', 'userId'], { unique: true })
@Index(['tenantId', 'username'])
export class UserRoleRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'tenant_id',
    type: 'uuid',
  })
  tenantId!: string;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 255,
  })
  userId!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  username!: string;

  @Column({
    type: 'jsonb',
  })
  roles!: string[];

  @Column({
    type: 'boolean',
    default: true,
  })
  active!: boolean;

  @Column({
    name: 'updated_at',
    type: 'timestamp with time zone',
  })
  updatedAt!: Date;
}
