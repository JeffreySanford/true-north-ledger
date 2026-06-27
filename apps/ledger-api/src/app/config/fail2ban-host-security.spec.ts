import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('production host SSH hardening documentation', () => {
  const fail2banTemplate = readFileSync(
    workspacePath('scripts', 'production', 'fail2ban-sshd.local'),
    'utf8',
  );
  const hostSecurityDocs = readFileSync(
    workspacePath('documentation', 'operations', 'host-security.md'),
    'utf8',
  );
  const deploymentDocs = readFileSync(workspacePath('DEPLOYMENT.md'), 'utf8');
  const productionDeploymentDocs = readFileSync(
    workspacePath('documentation', 'operations', 'production-deployment.md'),
    'utf8',
  );
  const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');

  it('provides a fail2ban sshd jail template with conservative defaults', () => {
    expect(fail2banTemplate).toContain('[sshd]');
    expect(fail2banTemplate).toContain('enabled = true');
    expect(fail2banTemplate).toContain('filter = sshd');
    expect(fail2banTemplate).toContain('backend = systemd');
    expect(fail2banTemplate).toContain('maxretry = 5');
    expect(fail2banTemplate).toContain('findtime = 10m');
    expect(fail2banTemplate).toContain('bantime = 1h');
    expect(fail2banTemplate).toContain('ignoreip = 127.0.0.1/8 ::1');
  });

  it('documents host-level installation, applicability, and verification', () => {
    expect(docsIndex).toContain('[Host Security](operations/host-security.md)');
    expect(hostSecurityDocs).toContain('scripts/production/fail2ban-sshd.local');
    expect(hostSecurityDocs).toContain('sudo apt-get install -y fail2ban');
    expect(hostSecurityDocs).toContain('/etc/fail2ban/jail.d/true-north-ledger-sshd.local');
    expect(hostSecurityDocs).toContain('sudo systemctl enable --now fail2ban');
    expect(hostSecurityDocs).toContain('sudo fail2ban-client status sshd');
    expect(hostSecurityDocs).toContain('not part of the Docker Compose stack');
    expect(deploymentDocs).toContain('[Host Security](documentation/operations/host-security.md)');
    expect(productionDeploymentDocs).toContain('[Host Security](host-security.md)');
  });
});
