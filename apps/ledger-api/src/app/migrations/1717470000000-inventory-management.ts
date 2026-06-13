import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventoryManagement1717470000000 implements MigrationInterface {
  name = 'InventoryManagement1717470000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        sku varchar(80) NOT NULL,
        name varchar(160) NOT NULL,
        description text NOT NULL DEFAULT '',
        location_id varchar(120) NOT NULL,
        location_name varchar(160) NOT NULL,
        quantity integer NOT NULL CHECK (quantity >= 0),
        reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
        reservation_order_id uuid,
        unit_of_measure varchar(40) NOT NULL,
        status varchar(40) NOT NULL,
        batch_number varchar(120),
        serial_number varchar(160),
        expiration_date date,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        last_scanned_at timestamp with time zone,
        removal_reason varchar(500),
        removed_at timestamp with time zone
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_inventory_tenant ON inventory_items (tenant_id)');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS IDX_inventory_tenant_sku ON inventory_items (tenant_id, sku)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_inventory_tenant_location ON inventory_items (tenant_id, location_id)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_inventory_tenant_status ON inventory_items (tenant_id, status)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_inventory_tenant_batch ON inventory_items (tenant_id, batch_number)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_inventory_tenant_location_status ON inventory_items (tenant_id, location_id, status)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS inventory_items');
  }
}
