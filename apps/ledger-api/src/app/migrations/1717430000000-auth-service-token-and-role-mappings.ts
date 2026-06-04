import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthServiceTokenAndRoleMappings1717430000000 implements MigrationInterface {
  name = 'AuthServiceTokenAndRoleMappings1717430000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS service_tokens (
        id uuid PRIMARY KEY,
        name varchar(255) NOT NULL,
        tenant_id uuid NOT NULL,
        permissions jsonb NOT NULL,
        hashed_token varchar(64) NOT NULL,
        revoked boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        revoked_at timestamp with time zone
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_service_tokens_hashed_token
      ON service_tokens (hashed_token)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_service_tokens_tenant_name
      ON service_tokens (tenant_id, name)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        role varchar(100) NOT NULL,
        permissions jsonb NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_tenant_role_permissions_tenant_role
      ON tenant_role_permissions (tenant_id, role)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_tenant_role_permissions_tenant_role');
    await queryRunner.query('DROP TABLE IF EXISTS tenant_role_permissions');

    await queryRunner.query('DROP INDEX IF EXISTS IDX_service_tokens_tenant_name');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_service_tokens_hashed_token');
    await queryRunner.query('DROP TABLE IF EXISTS service_tokens');
  }
}
