import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('API changelog documentation', () => {
  const changelog = readFileSync(
    workspacePath('documentation', 'platform', 'api-changelog.md'),
    'utf8',
  );

  it('documents v1.0.0 versioning strategy and release status', () => {
    expect(changelog).toContain('## Versioning Strategy');
    expect(changelog).toContain('/api/v1/...');
    expect(changelog).toContain('## v1.0.0');
    expect(changelog).toContain('None. This is the first public API release.');
    expect(changelog).toContain('### Deprecations');
    expect(changelog).toContain('No migration is required for v1.0.0.');
  });

  it('documents representative endpoint groups in the v1.0.0 endpoint inventory', () => {
    for (const endpoint of [
      '/api/health',
      '/api/metrics',
      '/api/v1/auth/login',
      '/api/v1/ledger/events',
      '/api/v1/devices/heartbeat',
      '/api/v1/device-events/batch',
      '/api/v1/orders/{id}/status',
      '/api/v1/proofs/verify',
      '/api/v1/inventory/{id}/reserve',
      '/api/v1/inventory/scan',
    ]) {
      expect(changelog).toContain(endpoint);
    }
  });
});
