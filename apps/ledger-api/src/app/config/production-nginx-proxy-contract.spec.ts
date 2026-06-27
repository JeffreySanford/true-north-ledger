import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('production Nginx proxy contract', () => {
  const nginxConfig = readFileSync(
    workspacePath('apps', 'docker', 'nginx', 'nginx.conf'),
    'utf8',
  );
  const webConfig = readFileSync(
    workspacePath('apps', 'docker', 'nginx', 'web.conf'),
    'utf8',
  );

  it('redirects HTTP traffic to HTTPS while preserving host and request URI', () => {
    expect(nginxConfig).toContain('listen 80;');
    expect(nginxConfig).toContain('return 301 https://$host$request_uri;');
    expect(nginxConfig).toContain('location /.well-known/acme-challenge/');
  });

  it('proxies API traffic to the API service with production forwarding headers', () => {
    expect(nginxConfig).toContain('upstream ledger_api');
    expect(nginxConfig).toContain('server ledger-api:3000;');
    expect(nginxConfig).toContain('location /api/');
    expect(nginxConfig).toContain('proxy_pass http://ledger_api;');
    expect(nginxConfig).toContain('proxy_set_header Host $host;');
    expect(nginxConfig).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-Proto https;');
  });

  it('upgrades generic and order WebSocket traffic to the API service', () => {
    for (const location of ['location /ws/', 'location /orders/']) {
      expect(nginxConfig).toContain(location);
    }

    expect(nginxConfig).toContain('map $http_upgrade $connection_upgrade');
    expect(nginxConfig).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(nginxConfig).toContain('proxy_set_header Connection $connection_upgrade;');
    expect(nginxConfig).toContain('proxy_read_timeout 75s;');
    expect(nginxConfig).toContain('limit_req zone=ws_limit');
  });

  it('serves static assets with immutable cache and app routes with SPA fallback', () => {
    expect(nginxConfig).toContain('upstream ledger_web');
    expect(nginxConfig).toContain('server ledger-web:80;');
    expect(nginxConfig).toContain('location ~* \\.(?:css|js|mjs|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|wasm)$');
    expect(nginxConfig).toContain('add_header Cache-Control "public, immutable" always;');
    expect(nginxConfig).toContain('add_header Cache-Control "no-store" always;');
    expect(webConfig).toContain('try_files $uri =404;');
    expect(webConfig).toContain('try_files $uri $uri/ /index.html;');
  });
});
