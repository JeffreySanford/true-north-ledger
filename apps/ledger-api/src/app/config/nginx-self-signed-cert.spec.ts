import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('nginx development self-signed certificate tooling', () => {
  const script = readFileSync(
    workspacePath('scripts', 'production', 'generate-self-signed-cert.sh'),
    'utf8',
  );
  const deploymentDocs = readFileSync(workspacePath('DEPLOYMENT.md'), 'utf8');
  const productionDeploymentDocs = readFileSync(
    workspacePath('documentation', 'operations', 'production-deployment.md'),
    'utf8',
  );
  const gitignore = readFileSync(workspacePath('.gitignore'), 'utf8');

  it('generates local-only TLS files for the Nginx certificate mount', () => {
    expect(script).toContain('CERT_DIR="${CERT_DIR:-apps/docker/nginx/certs}"');
    expect(script).toContain('CERT_DAYS="${CERT_DAYS:-365}"');
    expect(script).toContain('CERT_ALT_NAMES="${CERT_ALT_NAMES:-DNS:localhost,IP:127.0.0.1}"');
    expect(script).toContain('mkdir -p "$CERT_DIR"');
    expect(script).toContain('openssl req');
    expect(script).toContain('-x509');
    expect(script).toContain('-newkey rsa:2048');
    expect(script).toContain('-addext "subjectAltName=$CERT_ALT_NAMES"');
    expect(script).toContain('-keyout "$CERT_DIR/privkey.pem"');
    expect(script).toContain('-out "$CERT_DIR/fullchain.pem"');
    expect(script).toContain('chmod 600 "$CERT_DIR/privkey.pem"');
  });

  it('documents that self-signed certificates are not production TLS material', () => {
    expect(deploymentDocs).toContain('scripts/production/generate-self-signed-cert.sh');
    expect(deploymentDocs).toContain('Do not use self-signed certificates for public production traffic.');
    expect(deploymentDocs).toContain("Let's Encrypt");
    expect(productionDeploymentDocs).toContain('scripts/production/generate-self-signed-cert.sh');
    expect(productionDeploymentDocs).toContain('Public production deployments must replace them with CA-issued certificates');
    expect(gitignore).toContain('apps/docker/nginx/certs/*.pem');
  });
});
