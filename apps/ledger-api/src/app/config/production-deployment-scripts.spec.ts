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
  return readFileSync(
    workspacePath('scripts', 'production', name),
    'utf8',
  );
}

describe('production deployment scripts', () => {
  it('builds and deploys the production compose stack with the production env file', () => {
    const build = readProductionScript('build.sh');
    const deploy = readProductionScript('deploy.sh');

    expect(build).toContain('apps/docker/docker-compose.production.yml');
    expect(build).toContain('--env-file "$ENV_FILE"');
    expect(build).toContain('build "$@"');
    expect(deploy).toContain('scripts/production/pre-deploy.sh');
    expect(deploy).toContain('scripts/production/build.sh');
    expect(deploy).toContain('up -d --remove-orphans');
    expect(deploy).toContain('ps');
  });

  it('validates env vars, TLS certs, migrations, and compose config before deployment', () => {
    const preDeploy = readProductionScript('pre-deploy.sh');

    for (const variable of [
      'JWT_SECRET',
      'AUTH_PASSWORD',
      'DATABASE_URL',
      'POSTGRES_PASSWORD',
      'GRAFANA_ADMIN_PASSWORD',
      'PGADMIN_PASSWORD',
    ]) {
      expect(preDeploy).toContain(variable);
    }

    expect(preDeploy).toContain('Missing or placeholder production variable');
    expect(preDeploy).toContain('fullchain.pem');
    expect(preDeploy).toContain('privkey.pem');
    expect(preDeploy).toContain('openssl x509 -checkend 604800');
    expect(preDeploy).toContain('pnpm nx run ledger-api:build:production');
    expect(preDeploy).toContain('migration:show');
    expect(preDeploy).toContain('config >/dev/null');
  });

  it('backs up and restores PostgreSQL with explicit restore confirmation', () => {
    const backup = readProductionScript('backup.sh');
    const restore = readProductionScript('restore.sh');

    expect(backup).toContain('pg_dump -Fc');
    expect(backup).toContain('backups');
    expect(backup).toContain('true-north-ledger-$timestamp.dump');
    expect(restore).toContain('RESTORE_CONFIRM');
    expect(restore).toContain('pg_restore --clean --if-exists --no-owner');
    expect(restore).toContain('Usage: RESTORE_CONFIRM=restore');
  });

  it('documents deployment flow, backup, restore, and rollback procedure', () => {
    const docs = readFileSync(
      workspacePath('documentation', 'operations', 'production-deployment.md'),
      'utf8',
    );

    expect(docs).toContain('scripts/production/pre-deploy.sh');
    expect(docs).toContain('scripts/production/build.sh');
    expect(docs).toContain('scripts/production/deploy.sh');
    expect(docs).toContain('scripts/production/backup.sh');
    expect(docs).toContain('scripts/production/restore.sh');
    expect(docs).toContain('Rollback Procedure');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('/api/ready');
    expect(docs).toContain('/api/metrics');
  });
});
