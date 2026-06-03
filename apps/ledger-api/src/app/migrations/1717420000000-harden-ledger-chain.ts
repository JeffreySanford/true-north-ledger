import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenLedgerChain1717420000000 implements MigrationInterface {
  name = 'HardenLedgerChain1717420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ledger_events
        ADD COLUMN IF NOT EXISTS event_hash varchar(64),
        ADD COLUMN IF NOT EXISTS previous_hash varchar(64),
        ADD COLUMN IF NOT EXISTS chain_sequence bigint
    `);

    await queryRunner.query(`
      WITH ordered AS (
        SELECT
          id,
          tenant_id,
          row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS sequence,
          lag(md5(id::text) || md5(id::text || tenant_id::text)) OVER (
            PARTITION BY tenant_id
            ORDER BY created_at, id
          ) AS previous_event_hash
        FROM ledger_events
      )
      UPDATE ledger_events events
      SET
        chain_sequence = CASE
          WHEN events.chain_sequence IS NULL OR events.chain_sequence <= 0 THEN ordered.sequence
          ELSE events.chain_sequence
        END,
        event_hash = CASE
          WHEN events.event_hash IS NULL
            OR events.event_hash = '0000000000000000000000000000000000000000000000000000000000000000'
            THEN md5(events.id::text) || md5(events.id::text || events.tenant_id::text)
          ELSE events.event_hash
        END,
        previous_hash = COALESCE(events.previous_hash, ordered.previous_event_hash)
      FROM ordered
      WHERE events.id = ordered.id
    `);

    await queryRunner.query(`
      ALTER TABLE ledger_events
        ALTER COLUMN event_hash SET NOT NULL,
        ALTER COLUMN chain_sequence SET NOT NULL,
        ALTER COLUMN event_hash SET DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
        ALTER COLUMN chain_sequence SET DEFAULT 0
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE OR REPLACE FUNCTION prevent_ledger_event_mutation()
        RETURNS trigger AS $function$
        BEGIN
          RAISE EXCEPTION 'ledger_events is append-only';
        END;
        $function$ LANGUAGE plpgsql;

        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'TR_ledger_events_append_only'
        ) THEN
          CREATE TRIGGER "TR_ledger_events_append_only"
            BEFORE UPDATE OR DELETE ON ledger_events
            FOR EACH ROW
            EXECUTE FUNCTION prevent_ledger_event_mutation();
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CK_ledger_events_chain_sequence_positive'
        ) THEN
          ALTER TABLE ledger_events
            ADD CONSTRAINT "CK_ledger_events_chain_sequence_positive"
            CHECK (chain_sequence > 0);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CK_ledger_events_previous_hash_sequence'
        ) THEN
          ALTER TABLE ledger_events
            ADD CONSTRAINT "CK_ledger_events_previous_hash_sequence"
            CHECK (
              (chain_sequence = 1 AND previous_hash IS NULL)
              OR (chain_sequence > 1 AND previous_hash IS NOT NULL)
            );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_ledger_events_tenant_chain_sequence'
        ) THEN
          ALTER TABLE ledger_events
            ADD CONSTRAINT "UQ_ledger_events_tenant_chain_sequence"
            UNIQUE (tenant_id, chain_sequence);
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TR_ledger_events_append_only" ON ledger_events;
      DROP FUNCTION IF EXISTS prevent_ledger_event_mutation();

      ALTER TABLE ledger_events
        DROP CONSTRAINT IF EXISTS "UQ_ledger_events_tenant_chain_sequence",
        DROP CONSTRAINT IF EXISTS "CK_ledger_events_previous_hash_sequence",
        DROP CONSTRAINT IF EXISTS "CK_ledger_events_chain_sequence_positive"
    `);

    await queryRunner.query(`
      ALTER TABLE ledger_events
        DROP COLUMN IF EXISTS chain_sequence,
        DROP COLUMN IF EXISTS previous_hash,
        DROP COLUMN IF EXISTS event_hash
    `);
  }
}
