import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantUserRoles1717440000000 implements MigrationInterface {
  name = 'TenantUserRoles1717440000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        user_id varchar(255) NOT NULL,
        username varchar(255) NOT NULL,
        roles jsonb NOT NULL,
        active boolean NOT NULL DEFAULT true,
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_tenant_user_roles_tenant_user
      ON tenant_user_roles (tenant_id, user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_tenant_user_roles_tenant_username
      ON tenant_user_roles (tenant_id, username)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_tenant_user_roles_tenant_username');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_tenant_user_roles_tenant_user');
    await queryRunner.query('DROP TABLE IF EXISTS tenant_user_roles');
  }
}
