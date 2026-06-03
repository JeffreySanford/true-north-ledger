import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('ledger_events')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'chainSequence'])
@Index(['actorType', 'actorId'])
@Index(['subjectType', 'subjectId'])
@Index(['deviceId'], { where: 'device_id IS NOT NULL' })
export class LedgerEventEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type!: 'LEDGER_EVENT' | 'DEVICE_LEDGER_EVENT';

  @Column({
    name: 'actor_type',
    type: 'varchar',
    length: 50,
  })
  actorType!: string;

  @Column({
    name: 'actor_id',
    type: 'varchar',
    length: 255,
  })
  actorId!: string;

  @Column({
    name: 'subject_type',
    type: 'varchar',
    length: 50,
  })
  subjectType!: string;

  @Column({
    name: 'subject_id',
    type: 'varchar',
    length: 255,
  })
  subjectId!: string;

  @Column({
    name: 'device_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceId?: string;

  @Column({
    name: 'device_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  deviceType?: string;

  @Column({
    type: 'jsonb',
  })
  payload!: Record<string, unknown>;

  // Metadata fields
  @Column({
    name: 'tenant_id',
    type: 'uuid',
  })
  tenantId!: string;

  @Column({
    name: 'request_id',
    type: 'varchar',
    length: 255,
  })
  requestId!: string;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  correlationId?: string;

  @Column({
    name: 'source_ip',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  sourceIp?: string;

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 500,
  })
  userAgent!: string;

  @Column({
    name: 'payload_hash',
    type: 'varchar',
    length: 64,
  })
  payloadHash!: string;

  @Column({
    name: 'previous_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  previousHash?: string | null;

  @Column({
    name: 'event_hash',
    type: 'varchar',
    length: 64,
    default: '0000000000000000000000000000000000000000000000000000000000000000',
  })
  eventHash!: string;

  @Column({
    name: 'chain_sequence',
    type: 'bigint',
    default: 0,
  })
  chainSequence!: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  result!: 'accepted' | 'rejected' | 'failed';

  @Column({
    type: 'timestamp with time zone',
  })
  timestamp!: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt!: Date;
}
