import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('service_tokens')
@Index(['tenantId', 'name'])
@Index(['hashedToken'], { unique: true })
export class ServiceTokenEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  name!: string;

  @Column({
    name: 'tenant_id',
    type: 'uuid',
  })
  tenantId!: string;

  @Column({
    name: 'permissions',
    type: 'jsonb',
  })
  permissions!: string[];

  @Column({
    name: 'hashed_token',
    type: 'varchar',
    length: 64,
  })
  hashedToken!: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  revoked!: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  revokedAt?: Date;
}
