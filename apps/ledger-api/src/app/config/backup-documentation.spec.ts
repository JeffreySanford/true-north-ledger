import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

function readProductionScript(name: string): string {
  return readFileSync(workspacePath('scripts', 'production', name), 'utf8');
}

describe('backup documentation', () => {
  const docs = readFileSync(workspacePath('BACKUP.md'), 'utf8');
  const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');

  it('is linked from the documentation index', () => {
    expect(docsIndex).toContain('[Backup and Restore](../BACKUP.md)');
  });

  it('documents backup procedures that match the production backup script', () => {
    const backup = readProductionScript('backup.sh');

    expect(docs).toContain('## Backup Procedures');
    expect(docs).toContain('scripts/production/backup.sh');
    expect(docs).toContain('pg_dump -Fc');
    expect(docs).toContain('true-north-ledger-YYYYMMDDTHHMMSSZ.dump');
    expect(docs).toContain('BACKUP_DIR');
    expect(docs).toContain('durable storage');
    expect(backup).toContain('pg_dump -Fc');
    expect(backup).toContain('true-north-ledger-$timestamp.dump');
  });

  it('documents guarded restore procedures that match the restore script', () => {
    const restore = readProductionScript('restore.sh');

    expect(docs).toContain('## Restore Procedures');
    expect(docs).toContain('RESTORE_CONFIRM=restore');
    expect(docs).toContain('scripts/production/restore.sh <backup.dump>');
    expect(docs).toContain('pg_restore --clean --if-exists --no-owner');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('/api/ready');
    expect(docs).toContain('/api/metrics');
    expect(docs).toContain('/api/v1/ledger/events/chain/verify');
    expect(restore).toContain('RESTORE_CONFIRM=restore');
    expect(restore).toContain('pg_restore --clean --if-exists --no-owner');
  });

  it('documents disaster recovery and monitoring verification steps', () => {
    expect(docs).toContain('## Disaster Recovery');
    expect(docs).toContain('known-good backup');
    expect(docs).toContain('scripts/production/deploy.sh');
    expect(docs).toContain('Grafana is reachable on `3001:3000`');
    expect(docs).toContain('Prometheus is scraping `ledger-api:3000/api/metrics`');
    expect(docs).toContain('application version that produced it');
  });
});
