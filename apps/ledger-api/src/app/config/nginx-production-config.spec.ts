import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('production nginx config', () => {
  const configPath = workspacePath('apps', 'docker', 'nginx', 'nginx.conf');
  const config = readFileSync(configPath, 'utf8');

  it('proxies web, API, and WebSocket traffic with forwarded headers', () => {
    expect(config).toContain('upstream ledger_api');
    expect(config).toContain('upstream ledger_web');
    expect(config).toContain('location /api/');
    expect(config).toContain('location /ws/');
    expect(config).toContain('location /orders/');
    expect(config).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(config).toContain('proxy_set_header Connection $connection_upgrade;');
    expect(config).toContain('proxy_set_header X-Forwarded-Proto https;');
  });

  it('enforces production TLS, rate limiting, compression, cache, and security headers', () => {
    expect(config).toContain('return 301 https://$host$request_uri;');
    expect(config).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    expect(config).toContain('gzip on;');
    expect(config).toContain('limit_req_zone $binary_remote_addr zone=api_limit');
    expect(config).toContain('limit_req zone=auth_limit');
    expect(config).toContain('add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
    expect(config).toContain('add_header X-Frame-Options "DENY" always;');
    expect(config).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(config).toContain('add_header X-XSS-Protection "1; mode=block" always;');
    expect(config).toContain('add_header Content-Security-Policy');
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain('add_header Cache-Control "public, immutable" always;');
  });
});
