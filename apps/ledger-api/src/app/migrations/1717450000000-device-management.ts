import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceManagement1717450000000 implements MigrationInterface {
  name = 'DeviceManagement1717450000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id uuid PRIMARY KEY,
        device_name varchar(120) NOT NULL,
        device_type varchar(50) NOT NULL,
        tenant_id uuid NOT NULL,
        api_key_hash varchar(64) NOT NULL,
        public_key text,
        status varchar(50) NOT NULL DEFAULT 'active',
        last_seen_at timestamp with time zone,
        heartbeat_failure_count integer NOT NULL DEFAULT 0,
        auto_suspended_at timestamp with time zone,
        permissions jsonb NOT NULL,
        metadata jsonb NOT NULL,
        provisioning_payload_version integer NOT NULL DEFAULT 1,
        last_provisioned_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        revoked_at timestamp with time zone
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_devices_api_key_hash
      ON devices (api_key_hash)
    `);

    await queryRunner.query(`
      ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS heartbeat_failure_count integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS auto_suspended_at timestamp with time zone
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_devices_tenant_name
      ON devices (tenant_id, device_name)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_devices_tenant_status
      ON devices (tenant_id, status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_devices_tenant_type
      ON devices (tenant_id, device_type)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_nonces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        nonce_value varchar(200) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_device_nonces_device_nonce
      ON device_nonces (device_id, nonce_value)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_device_nonces_created_at
      ON device_nonces (created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_device_nonces_created_at');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_device_nonces_device_nonce');
    await queryRunner.query('DROP TABLE IF EXISTS device_nonces');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_devices_tenant_type');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_devices_tenant_status');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_devices_tenant_name');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_devices_api_key_hash');
    await queryRunner.query('DROP TABLE IF EXISTS devices');
  }
}
