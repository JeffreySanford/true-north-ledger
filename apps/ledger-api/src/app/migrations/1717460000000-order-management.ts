import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderManagement1717460000000 implements MigrationInterface {
  name = 'OrderManagement1717460000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY,
        order_number varchar(40) NOT NULL,
        tenant_id uuid NOT NULL,
        customer_id varchar(120) NOT NULL,
        customer_name varchar(160) NOT NULL,
        customer_email varchar(254),
        status varchar(40) NOT NULL,
        items jsonb NOT NULL,
        total_amount numeric(14, 2) NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'USD',
        shipping_address jsonb NOT NULL,
        billing_address jsonb,
        metadata jsonb NOT NULL,
        correlation_id uuid NOT NULL,
        idempotency_key varchar(160),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        confirmed_at timestamp with time zone,
        shipped_at timestamp with time zone,
        delivered_at timestamp with time zone,
        cancelled_at timestamp with time zone
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_orders_order_number
      ON orders (order_number)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_orders_tenant_id
      ON orders (tenant_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_orders_tenant_customer
      ON orders (tenant_id, customer_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_orders_tenant_created
      ON orders (tenant_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_orders_tenant_status_created
      ON orders (tenant_id, status, created_at)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_orders_tenant_idempotency_key
      ON orders (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS IDX_orders_tenant_idempotency_key',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS IDX_orders_tenant_status_created',
    );
    await queryRunner.query('DROP INDEX IF EXISTS IDX_orders_tenant_created');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_orders_tenant_customer');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_orders_tenant_id');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_orders_order_number');
    await queryRunner.query('DROP TABLE IF EXISTS orders');
  }
}
