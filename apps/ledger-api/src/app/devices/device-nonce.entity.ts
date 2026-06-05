import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'device_nonces' })
@Index('IDX_device_nonces_device_nonce', ['deviceId', 'nonceValue'], { unique: true })
@Index('IDX_device_nonces_created_at', ['createdAt'])
export class DeviceNonceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @Column({ name: 'nonce_value', type: 'varchar', length: 200 })
  nonceValue!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;
}
