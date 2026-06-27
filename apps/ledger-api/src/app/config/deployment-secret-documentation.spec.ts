import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { requiredRuntimeEnvNames } from './runtime-env.validation';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('deployment secret documentation', () => {
  const docs = readFileSync(
    workspacePath('documentation', 'operations', 'deployment-secrets.md'),
    'utf8',
  );
  const envExample = readFileSync(workspacePath('.env.example'), 'utf8');

  it('documents every runtime production environment variable', () => {
    expect(docs).toContain('`NODE_ENV`');

    for (const variable of requiredRuntimeEnvNames('production')) {
      expect(docs).toContain(`\`${variable}\``);
    }
  });

  it('documents production compose admin console secrets', () => {
    for (const variable of [
      'GRAFANA_ADMIN_USER',
      'GRAFANA_ADMIN_PASSWORD',
      'PGADMIN_EMAIL',
      'PGADMIN_PASSWORD',
      'REDIS_URL',
    ]) {
      expect(docs).toContain(`\`${variable}\``);
      expect(envExample).toContain(`${variable}=`);
    }
  });

  it('keeps examples placeholder-only and documents rotation guidance', () => {
    expect(envExample).toContain('JWT_SECRET=<required-secret-at-least-32-random-characters>');
    expect(envExample).toContain('GRAFANA_ADMIN_PASSWORD=<required-secret>');
    expect(envExample).not.toContain('GRAFANA_ADMIN_PASSWORD=admin');
    expect(envExample).not.toContain('POSTGRES_PASSWORD=password');
    expect(docs).toContain('Do not commit real production values.');
    expect(docs).toContain('Rotate secrets after staff changes');
    expect(docs).toContain('Do not log environment dumps');
  });
});
