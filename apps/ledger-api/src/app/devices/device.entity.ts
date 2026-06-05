import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { DevicePermission, DeviceStatus, DeviceType } from '@true-north-ledger/device-contracts';

@Entity('devices')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'type'])
@Index(['tenantId', 'name'], { unique: true })
@Index(['apiKeyHash'], { unique: true })
export class DeviceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'device_name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'device_type', type: 'varchar', length: 50 })
  type!: DeviceType;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'api_key_hash', type: 'varchar', length: 64 })
  apiKeyHash!: string;

  @Column({ name: 'public_key', type: 'text', nullable: true })
  publicKey?: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: DeviceStatus;

  @Column({ name: 'last_seen_at', type: 'timestamp with time zone', nullable: true })
  lastSeenAt?: Date | null;

  @Column({ name: 'heartbeat_failure_count', type: 'integer', default: 0 })
  heartbeatFailureCount!: number;

  @Column({ name: 'auto_suspended_at', type: 'timestamp with time zone', nullable: true })
  autoSuspendedAt?: Date | null;

  @Column({ type: 'jsonb' })
  permissions!: DevicePermission[];

  @Column({ type: 'jsonb' })
  metadata!: Record<string, unknown>;

  @Column({ name: 'provisioning_payload_version', type: 'integer', default: 1 })
  provisioningPayloadVersion!: number;

  @Column({ name: 'last_provisioned_at', type: 'timestamp with time zone', nullable: true })
  lastProvisionedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamp with time zone', nullable: true })
  revokedAt?: Date | null;
}
