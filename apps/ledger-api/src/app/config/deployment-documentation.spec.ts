import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('deployment documentation', () => {
  const docs = readFileSync(workspacePath('DEPLOYMENT.md'), 'utf8');
  const readme = readFileSync(workspacePath('README.md'), 'utf8');
  const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
  const deploy = readFileSync(workspacePath('scripts', 'production', 'deploy.sh'), 'utf8');
  const preDeploy = readFileSync(workspacePath('scripts', 'production', 'pre-deploy.sh'), 'utf8');

  it('is linked from the documentation index and root README', () => {
    expect(docsIndex).toContain('[Deployment](../DEPLOYMENT.md)');
    expect(readme).toContain('## Production Deployment');
    expect(readme).toContain('[Deployment](DEPLOYMENT.md)');
    expect(readme).toContain('[Backup and Restore](BACKUP.md)');
    expect(readme).toContain('[Monitoring](MONITORING.md)');
  });

  it('documents prerequisites, installation steps, and configuration overrides', () => {
    expect(docs).toContain('## Prerequisites');
    expect(docs).toContain('Docker with Compose v2');
    expect(docs).toContain('pnpm install');
    expect(docs).toContain('apps/docker/nginx/certs/fullchain.pem');
    expect(docs).toContain('## Installation Steps');
    expect(docs).toContain('scripts/production/pre-deploy.sh');
    expect(docs).toContain('scripts/production/build.sh');
    expect(docs).toContain('scripts/production/deploy.sh');
    expect(docs).toContain('## Configuration Guide');

    for (const variable of ['COMPOSE_FILE', 'PROJECT_NAME', 'ENV_FILE', 'CERT_DIR']) {
      expect(docs).toContain(`\`${variable}\``);
    }
  });

  it('documents start, stop, verification, and troubleshooting commands', () => {
    expect(docs).toContain('## Starting And Stopping Services');
    expect(docs).toContain('docker compose --env-file .env.production');
    expect(docs).toContain('down');
    expect(docs).toContain('restart ledger-api ledger-web nginx');
    expect(docs).toContain('logs --tail=200 ledger-api nginx');
    expect(docs).toContain('## Verification');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('/api/ready');
    expect(docs).toContain('/api/metrics');
    expect(docs).toContain('/api/docs');
    expect(docs).toContain('## Troubleshooting');
  });

  it('stays aligned with production deployment scripts', () => {
    expect(deploy).toContain('scripts/production/pre-deploy.sh');
    expect(deploy).toContain('scripts/production/build.sh');
    expect(deploy).toContain('up -d --remove-orphans');
    expect(preDeploy).toContain('Missing or placeholder production variable');
    expect(preDeploy).toContain('openssl x509 -checkend 604800');
    expect(docs).toContain('Missing or placeholder values');
    expect(docs).toContain('docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml config');
  });
});
