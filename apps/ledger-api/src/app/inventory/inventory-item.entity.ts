import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { InventoryStatus } from '@true-north-ledger/inventory-contracts';

@Entity('inventory_items')
@Index(['tenantId'])
@Index(['tenantId', 'sku'], { unique: true })
@Index(['tenantId', 'locationId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'batchNumber'])
@Index(['tenantId', 'locationId', 'status'])
export class InventoryItemEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 80 })
  sku!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ name: 'location_id', type: 'varchar', length: 120 })
  locationId!: string;

  @Column({ name: 'location_name', type: 'varchar', length: 160 })
  locationName!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'reserved_quantity', type: 'integer', default: 0 })
  reservedQuantity!: number;

  @Column({ name: 'reservation_order_id', type: 'uuid', nullable: true })
  reservationOrderId?: string | null;

  @Column({ name: 'unit_of_measure', type: 'varchar', length: 40 })
  unitOfMeasure!: string;

  @Column({ type: 'varchar', length: 40 })
  status!: InventoryStatus;

  @Column({ name: 'batch_number', type: 'varchar', length: 120, nullable: true })
  batchNumber?: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 160, nullable: true })
  serialNumber?: string | null;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate?: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  @Column({ name: 'last_scanned_at', type: 'timestamp with time zone', nullable: true })
  lastScannedAt?: Date | null;

  @Column({ name: 'removal_reason', type: 'varchar', length: 500, nullable: true })
  removalReason?: string | null;

  @Column({ name: 'removed_at', type: 'timestamp with time zone', nullable: true })
  removedAt?: Date | null;
}
