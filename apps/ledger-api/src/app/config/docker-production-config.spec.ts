import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('production docker compose config', () => {
  const compose = readFileSync(
    workspacePath('apps', 'docker', 'docker-compose.production.yml'),
    'utf8',
  );
  const apiDockerfile = readFileSync(
    workspacePath('apps', 'docker', 'Dockerfile.api'),
    'utf8',
  );
  const webDockerfile = readFileSync(
    workspacePath('apps', 'docker', 'Dockerfile.web'),
    'utf8',
  );
  const webNginx = readFileSync(
    workspacePath('apps', 'docker', 'nginx', 'web.conf'),
    'utf8',
  );

  it('defines all production services and dependencies', () => {
    for (const service of [
      'nginx',
      'ledger-web',
      'ledger-api',
      'postgres',
      'redis',
      'prometheus',
      'grafana',
      'pgadmin',
    ]) {
      expect(compose).toContain(`  ${service}:`);
    }

    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('dockerfile: apps/docker/Dockerfile.api');
    expect(compose).toContain('dockerfile: apps/docker/Dockerfile.web');
  });

  it('configures production health checks, restart policies, resources, and logging', () => {
    expect(compose).toContain('restart: always');
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('driver: json-file');
    expect(compose).toContain('max-size: "10m"');
    expect(compose).toContain('resources:');
    expect(compose).toContain('memory: 768M');
  });

  it('configures persistence volumes and segmented networks', () => {
    for (const volume of [
      'postgres-data',
      'redis-data',
      'grafana-data',
      'prometheus-data',
    ]) {
      expect(compose).toContain(`${volume}:`);
    }

    expect(compose).toContain('frontend-network:');
    expect(compose).toContain('backend-network:');
    expect(compose).toContain('monitoring-network:');
  });

  it('builds API and web production images from Nx outputs', () => {
    expect(apiDockerfile).toContain('pnpm nx run ledger-api:build:production');
    expect(apiDockerfile).toContain('pnpm nx run ledger-api:prune');
    expect(apiDockerfile).toContain('CMD ["node", "main.js"]');
    expect(webDockerfile).toContain('pnpm nx run ledger-web:build:production');
    expect(webDockerfile).toContain('/usr/share/nginx/html');
    expect(webNginx).toContain('try_files $uri $uri/ /index.html;');
  });
});
