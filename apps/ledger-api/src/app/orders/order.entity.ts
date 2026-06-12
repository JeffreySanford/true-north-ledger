import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  OrderAddress,
  OrderItem,
  OrderStatus,
} from '@true-north-ledger/order-contracts';

@Entity('orders')
@Index(['tenantId'])
@Index(['orderNumber'], { unique: true })
@Index(['tenantId', 'status', 'createdAt'])
@Index(['tenantId', 'customerId'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class OrderEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 40 })
  orderNumber!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 120 })
  customerId!: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 160 })
  customerName!: string;

  @Column({
    name: 'customer_email',
    type: 'varchar',
    length: 254,
    nullable: true,
  })
  customerEmail?: string | null;

  @Column({ type: 'varchar', length: 40 })
  status!: OrderStatus;

  @Column({ type: 'jsonb' })
  items!: OrderItem[];

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress!: OrderAddress;

  @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
  billingAddress?: OrderAddress | null;

  @Column({ type: 'jsonb' })
  metadata!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  idempotencyKey?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  @Column({
    name: 'confirmed_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  confirmedAt?: Date | null;

  @Column({
    name: 'shipped_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  shippedAt?: Date | null;

  @Column({
    name: 'delivered_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  deliveredAt?: Date | null;

  @Column({
    name: 'cancelled_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  cancelledAt?: Date | null;
}
