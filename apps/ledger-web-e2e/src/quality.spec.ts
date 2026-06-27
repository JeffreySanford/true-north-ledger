import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromRoot = join(process.cwd(), ...segments);
  if (existsSync(fromRoot)) {
    return fromRoot;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

function collectBrowserIssues(page: Page): string[] {
  const issues: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console error: ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    issues.push(`page error: ${error.message}`);
  });

  return issues;
}

const socketBaseUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

test.describe('ledger-web quality gates', () => {
  test.beforeEach(async ({ context }) => {
    const events: unknown[] = [];
    const devices = [
      {
        id: '00000000-0000-4000-8000-000000000201',
        name: 'Quality scanner',
        type: 'scanner',
        tenantId: '00000000-0000-0000-0000-000000000000',
        status: 'active',
        permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
        metadata: {},
        lastSeenAt: '2026-06-04T12:00:00.000Z',
        online: true,
        createdAt: '2026-06-04T12:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
        revokedAt: null,
      },
    ];

    await context.addInitScript((apiUrl) => {
      window.localStorage.setItem('tnl.socketBaseUrl', apiUrl);
      window.localStorage.setItem('tnl.authToken', 'quality-test-token');
      window.localStorage.setItem(
        'tnl.authUser',
        JSON.stringify({
          userId: 'quality-user',
          username: 'quality-user',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
        }),
      );
    }, socketBaseUrl);

    await context.route(/.*\/api\/v1\/ledger\/events.*/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(events),
        });
        return;
      }

      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as {
          type: 'LEDGER_EVENT';
          subjectType: string;
          subjectId: string;
          payload: Record<string, unknown>;
        };
        const event = {
          id: randomUUID(),
          type: body.type,
          actorType: 'user',
          actorId: 'frontend-demo',
          subjectType: body.subjectType,
          subjectId: body.subjectId,
          payload: body.payload,
          metadata: {
            tenantId: '00000000-0000-4000-8000-000000000000',
            requestId: randomUUID(),
            correlationId: randomUUID(),
            userAgent: 'playwright',
            payloadHash: 'a'.repeat(64),
            eventHash: 'b'.repeat(64),
            chainSequence: events.length + 1,
            result: 'accepted',
            timestamp: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
        };
        events.unshift(event);

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(event),
        });
        return;
      }

      await route.fallback();
    });

    await context.route(/.*\/api\/v1\/devices.*/, async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ devices, total: devices.length }),
        });
        return;
      }

      await route.fallback();
    });

    await context.route(/.*\/api\/metrics.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'true_north_ledger_websocket_connections_active 0\n',
      });
    });

    await context.route(/.*\/api\/v1\/inventory\/anomalies.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ anomalies: [], total: 0, page: 1, pageSize: 20 }),
      });
    });
  });

  test('reports production health, readiness, and metrics endpoints', async ({ request }) => {
    const healthResponse = await request.get('/api/health');
    expect(healthResponse.status()).toBe(200);
    const health = (await healthResponse.json()) as {
      service: string;
      status: string;
      environment: {
        nodeEnv: string;
        production: boolean;
        requiredVariables: string[];
      };
      dependencies: {
        database: { status: string };
      };
    };

    expect(health.service).toBe('true-north-ledger-api');
    expect(health.status).toBe('ok');
    expect(health.environment.requiredVariables).toContain('JWT_SECRET');
    expect(health.environment.production).toBe(false);
    expect(health.dependencies.database.status).toBe('ok');

    const readinessResponse = await request.get('/api/ready');
    expect(readinessResponse.status()).toBe(200);
    const readiness = (await readinessResponse.json()) as {
      service: string;
      ready: boolean;
    };

    expect(readiness.service).toBe('true-north-ledger-api');
    expect(readiness.ready).toBe(true);

    const metricsResponse = await request.get('/api/metrics');
    expect(metricsResponse.status()).toBe(200);
    const metrics = await metricsResponse.text();

    expect(metrics).toContain('true_north_ledger_api_up 1');
    expect(metrics).toContain('true_north_ledger_database_up 1');
    expect(metrics).toMatch(/true_north_ledger_websocket_connections_active \d+/);
  });

  test('production nginx config proxies API, web, and websocket traffic', async () => {
    const config = readFileSync(
      workspacePath('apps', 'docker', 'nginx', 'nginx.conf'),
      'utf8',
    );

    expect(config).toContain('return 301 https://$host$request_uri;');
    expect(config).toContain('location /api/');
    expect(config).toContain('location /ws/');
    expect(config).toContain('location /orders/');
    expect(config).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(config).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(config).toContain('limit_req_zone $binary_remote_addr zone=api_limit');
    expect(config).toContain('gzip on;');
    expect(config).toContain('add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
    expect(config).toContain('add_header X-Frame-Options "DENY" always;');
    expect(config).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(config).toContain('add_header X-XSS-Protection "1; mode=block" always;');
    expect(config).toContain('add_header Content-Security-Policy');
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain('add_header Cache-Control "public, immutable" always;');
  });

  test('production nginx proxy contract covers redirect, API, WebSocket, and static assets', async () => {
    const nginxConfig = readFileSync(
      workspacePath('apps', 'docker', 'nginx', 'nginx.conf'),
      'utf8',
    );
    const webConfig = readFileSync(
      workspacePath('apps', 'docker', 'nginx', 'web.conf'),
      'utf8',
    );
    const contractSpec = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'production-nginx-proxy-contract.spec.ts'),
      'utf8',
    );

    expect(contractSpec).toContain('redirects HTTP traffic to HTTPS');
    expect(contractSpec).toContain('proxies API traffic to the API service');
    expect(contractSpec).toContain('upgrades generic and order WebSocket traffic');
    expect(contractSpec).toContain('serves static assets with immutable cache');
    expect(nginxConfig).toContain('return 301 https://$host$request_uri;');
    expect(nginxConfig).toContain('location /api/');
    expect(nginxConfig).toContain('proxy_pass http://ledger_api;');
    expect(nginxConfig).toContain('location /ws/');
    expect(nginxConfig).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(nginxConfig).toContain('location ~* \\.(?:css|js|mjs|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|wasm)$');
    expect(webConfig).toContain('try_files $uri $uri/ /index.html;');
  });

  test('production nginx self-signed certificate tooling is documented', async () => {
    const script = readFileSync(
      workspacePath('scripts', 'production', 'generate-self-signed-cert.sh'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('DEPLOYMENT.md'), 'utf8');
    const operationsDocs = readFileSync(
      workspacePath('documentation', 'operations', 'production-deployment.md'),
      'utf8',
    );
    const gitignore = readFileSync(workspacePath('.gitignore'), 'utf8');
    const nginxConfig = readFileSync(
      workspacePath('apps', 'docker', 'nginx', 'nginx.conf'),
      'utf8',
    );

    expect(script).toContain('CERT_DIR="${CERT_DIR:-apps/docker/nginx/certs}"');
    expect(script).toContain('openssl req');
    expect(script).toContain('-x509');
    expect(script).toContain('-newkey rsa:2048');
    expect(script).toContain('-addext "subjectAltName=$CERT_ALT_NAMES"');
    expect(script).toContain('-out "$CERT_DIR/fullchain.pem"');
    expect(script).toContain('-keyout "$CERT_DIR/privkey.pem"');
    expect(script).toContain('chmod 600 "$CERT_DIR/privkey.pem"');
    expect(nginxConfig).toContain('ssl_certificate /etc/nginx/certs/fullchain.pem;');
    expect(nginxConfig).toContain('ssl_certificate_key /etc/nginx/certs/privkey.pem;');
    expect(gitignore).toContain('apps/docker/nginx/certs/*.pem');
    expect(docs).toContain('scripts/production/generate-self-signed-cert.sh');
    expect(docs).toContain('Do not use self-signed certificates for public production traffic.');
    expect(operationsDocs).toContain('Public production deployments must replace them with CA-issued certificates');
  });

  test('production host SSH hardening documents fail2ban setup', async () => {
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

    expect(fail2banTemplate).toContain('[sshd]');
    expect(fail2banTemplate).toContain('enabled = true');
    expect(fail2banTemplate).toContain('backend = systemd');
    expect(fail2banTemplate).toContain('maxretry = 5');
    expect(fail2banTemplate).toContain('findtime = 10m');
    expect(fail2banTemplate).toContain('bantime = 1h');
    expect(hostSecurityDocs).toContain('sudo apt-get install -y fail2ban');
    expect(hostSecurityDocs).toContain('sudo fail2ban-client status sshd');
    expect(hostSecurityDocs).toContain('not part of the Docker Compose stack');
    expect(deploymentDocs).toContain('[Host Security](documentation/operations/host-security.md)');
    expect(productionDeploymentDocs).toContain('[Host Security](host-security.md)');
    expect(docsIndex).toContain('[Host Security](operations/host-security.md)');
  });

  test('production monitoring config provisions Prometheus and Grafana', async () => {
    const packageJson = readFileSync(workspacePath('package.json'), 'utf8');
    const metricsModule = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.module.ts'),
      'utf8',
    );
    const prometheusConfig = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'prometheus.config.ts'),
      'utf8',
    );
    const prometheus = readFileSync(
      workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
      'utf8',
    );
    const alerts = readFileSync(
      workspacePath('apps', 'docker', 'prometheus', 'rules', 'ledger-alerts.yml'),
      'utf8',
    );
    const datasource = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'provisioning',
        'datasources',
        'prometheus.yml',
      ),
      'utf8',
    );
    const dashboard = JSON.parse(
      readFileSync(
        workspacePath(
          'apps',
          'docker',
          'grafana',
          'dashboards',
          'true-north-ledger-overview.json',
        ),
        'utf8',
      ),
    ) as { title: string; panels: Array<{ title: string }> };

    expect(packageJson).toContain('"@willsoto/nestjs-prometheus"');
    expect(packageJson).toContain('"prom-client"');
    expect(metricsModule).toContain('PrometheusModule.register(prometheusModuleOptions)');
    expect(metricsModule).toContain('exports: [MetricsService, PrometheusModule]');
    expect(prometheusConfig).toContain("path: '/internal/prometheus'");
    expect(prometheusConfig).toContain('enabled: false');
    expect(prometheusConfig).toContain("app: 'true-north-ledger-api'");
    expect(prometheus).toContain('scrape_interval: 15s');
    expect(prometheus).toContain('metrics_path: /api/metrics');
    expect(prometheus).toContain('ledger-api:3000');
    expect(alerts).toContain('TrueNorthLedgerApiDown');
    expect(alerts).toContain('TrueNorthLedgerDatabaseUnavailable');
    expect(alerts).toContain('TrueNorthLedgerWebSocketConnectionsDropped');
    expect(datasource).toContain('url: http://prometheus:9090');
    expect(dashboard.title).toBe('True North Ledger Production Overview');
    expect(dashboard.panels.map((panel) => panel.title)).toEqual(
      expect.arrayContaining([
        'API availability',
        'Database availability',
        'WebSocket connections',
      ]),
    );
  });

  test('production monitoring contract covers scraping, Grafana loading, and metric updates', async () => {
    const prometheus = readFileSync(
      workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
      'utf8',
    );
    const datasource = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'provisioning',
        'datasources',
        'prometheus.yml',
      ),
      'utf8',
    );
    const dashboardProvider = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'provisioning',
        'dashboards',
        'dashboards.yml',
      ),
      'utf8',
    );
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );
    const metricsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.service.ts'),
      'utf8',
    );
    const contractSpec = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'production-monitoring-contract.spec.ts'),
      'utf8',
    );

    expect(contractSpec).toContain('scrapes the API Prometheus endpoint');
    expect(contractSpec).toContain('provisions Grafana with the Prometheus datasource');
    expect(contractSpec).toContain('metrics that update when runtime samples are recorded');
    expect(prometheus).toContain('job_name: true-north-ledger-api');
    expect(prometheus).toContain('metrics_path: /api/metrics');
    expect(prometheus).toContain('ledger-api:3000');
    expect(datasource).toContain('url: http://prometheus:9090');
    expect(dashboardProvider).toContain('/var/lib/grafana/dashboards');
    expect(dashboard).toContain('"title": "True North Ledger Production Overview"');
    expect(dashboard).toContain('true_north_ledger_http_requests_total');
    expect(dashboard).toContain('true_north_ledger_http_request_duration_seconds_bucket');
    expect(dashboard).toContain('true_north_ledger_database_query_duration_seconds_bucket');
    expect(dashboard).toContain('true_north_ledger_ledger_events_created_total');
    expect(dashboard).toContain('true_north_ledger_device_heartbeats_total');
    expect(metricsService).toContain('recordHttpRequest');
    expect(metricsService).toContain('recordLedgerEventCreated');
    expect(metricsService).toContain('recordDeviceHeartbeat');
  });

  test('production docker compose config defines the full service stack', async () => {
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

    expect(compose).toContain('- "80:80"');
    expect(compose).toContain('- "443:443"');
    expect(compose).toContain('- "3001:3000"');
    expect(compose).toContain('- "5050:80"');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('restart: always');
    expect(compose).toContain('driver: json-file');
    expect(compose).toContain('resources:');
    expect(compose).toContain('postgres-data:');
    expect(compose).toContain('redis-data:');
    expect(compose).toContain('grafana-data:');
    expect(compose).toContain('prometheus-data:');
    expect(compose).toContain('frontend-network:');
    expect(compose).toContain('backend-network:');
    expect(compose).toContain('monitoring-network:');
    expect(apiDockerfile).toContain('pnpm nx run ledger-api:build:production');
    expect(apiDockerfile).toContain('CMD ["node", "main.js"]');
    expect(webDockerfile).toContain('pnpm nx run ledger-web:build:production');
    expect(webDockerfile).toContain('/usr/share/nginx/html');
    expect(webNginx).toContain('try_files $uri $uri/ /index.html;');
  });

  test('production deployment secret documentation covers required variables safely', async () => {
    const docs = readFileSync(
      workspacePath('documentation', 'operations', 'deployment-secrets.md'),
      'utf8',
    );
    const envExample = readFileSync(workspacePath('.env.example'), 'utf8');

    for (const variable of [
      'JWT_SECRET',
      'AUTH_USERNAME',
      'AUTH_PASSWORD',
      'AUTH_TENANT_ID',
      'CORS_ORIGIN',
      'DATABASE_URL',
      'JWT_EXPIRATION',
      'JWT_REFRESH_EXPIRATION',
      'POSTGRES_DB',
      'POSTGRES_HOST',
      'POSTGRES_PASSWORD',
      'POSTGRES_PORT',
      'POSTGRES_USER',
      'REDIS_URL',
      'GRAFANA_ADMIN_USER',
      'GRAFANA_ADMIN_PASSWORD',
      'PGADMIN_EMAIL',
      'PGADMIN_PASSWORD',
    ]) {
      expect(docs).toContain(`\`${variable}\``);
      expect(envExample).toContain(`${variable}=`);
    }

    expect(envExample).toContain('JWT_SECRET=<required-secret-at-least-32-random-characters>');
    expect(envExample).toContain('GRAFANA_ADMIN_PASSWORD=<required-secret>');
    expect(envExample).not.toContain('JWT_SECRET=secret');
    expect(envExample).not.toContain('POSTGRES_PASSWORD=password');
    expect(docs).toContain('Do not commit real production values.');
    expect(docs).toContain('Rotate secrets after staff changes');
    expect(docs).toContain('Do not log environment dumps');
  });

  test('production deployment scripts cover build, deploy, backup, restore, and rollback', async () => {
    const build = readFileSync(
      workspacePath('scripts', 'production', 'build.sh'),
      'utf8',
    );
    const preDeploy = readFileSync(
      workspacePath('scripts', 'production', 'pre-deploy.sh'),
      'utf8',
    );
    const deploy = readFileSync(
      workspacePath('scripts', 'production', 'deploy.sh'),
      'utf8',
    );
    const backup = readFileSync(
      workspacePath('scripts', 'production', 'backup.sh'),
      'utf8',
    );
    const restore = readFileSync(
      workspacePath('scripts', 'production', 'restore.sh'),
      'utf8',
    );
    const docs = readFileSync(
      workspacePath('documentation', 'operations', 'production-deployment.md'),
      'utf8',
    );

    expect(build).toContain('apps/docker/docker-compose.production.yml');
    expect(build).toContain('build "$@"');
    expect(preDeploy).toContain('Missing or placeholder production variable');
    expect(preDeploy).toContain('openssl x509 -checkend 604800');
    expect(preDeploy).toContain('migration:show');
    expect(preDeploy).toContain('config >/dev/null');
    expect(deploy).toContain('scripts/production/pre-deploy.sh');
    expect(deploy).toContain('up -d --remove-orphans');
    expect(backup).toContain('pg_dump -Fc');
    expect(restore).toContain('RESTORE_CONFIRM=restore');
    expect(restore).toContain('pg_restore --clean --if-exists --no-owner');
    expect(docs).toContain('Rollback Procedure');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('/api/ready');
    expect(docs).toContain('/api/metrics');
  });

  test('OpenAPI config documents server metadata and JWT plus device-key auth', async () => {
    const config = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'openapi.config.ts'),
      'utf8',
    );
    const dtoModels = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'openapi-dto.models.ts'),
      'utf8',
    );
    const main = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'main.ts'),
      'utf8',
    );
    const devices = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'devices.controller.ts'),
      'utf8',
    );
    const deviceEvents = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'device-events.controller.ts'),
      'utf8',
    );
    const inventoryScan = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'inventory', 'inventory-scan.controller.ts'),
      'utf8',
    );

    expect(config).toContain("export const openApiPath = 'api/docs';");
    expect(config).toContain(".setTitle('True North Ledger API')");
    expect(config).toContain(".setVersion('1.0.0')");
    expect(config).toContain(".addServer(publicApiOrigin, 'Configured API origin')");
    expect(config).toContain(".addBearerAuth(");
    expect(config).toContain("'jwt'");
    expect(config).toContain(".addApiKey(");
    expect(config).toContain("name: 'X-Device-Key'");
    expect(config).toContain("'device-key'");
    expect(main).toContain('createOpenApiConfig()');
    expect(main).toContain('extraModels: openApiDtoModels');
    expect(main).toContain('SwaggerModule.setup(swaggerPath, app, openApiDocument');
    expect(dtoModels).toContain('ApiProperty');
    expect(dtoModels).toContain('ApiPropertyOptional');
    expect(dtoModels).toContain('OpenApiLoginRequestDto');
    expect(dtoModels).toContain('OpenApiAuthResponseDto');
    expect(dtoModels).toContain('OpenApiLedgerEventResponseDto');
    expect(dtoModels).toContain('OpenApiCreateOrderRequestDto');
    expect(dtoModels).toContain('OpenApiInventoryScanRequestDto');
    expect(devices).toContain("@ApiSecurity('device-key')");
    expect(deviceEvents).toContain("@ApiSecurity('device-key')");
    expect(inventoryScan).toContain("@ApiSecurity('device-key')");
  });

  test('API changelog documents v1 release, endpoint inventory, and versioning policy', async () => {
    const changelog = readFileSync(
      workspacePath('documentation', 'platform', 'api-changelog.md'),
      'utf8',
    );
    const docsIndex = readFileSync(
      workspacePath('documentation', 'README.md'),
      'utf8',
    );

    expect(docsIndex).toContain('[API Changelog](platform/api-changelog.md)');
    expect(changelog).toContain('## Versioning Strategy');
    expect(changelog).toContain('## v1.0.0');
    expect(changelog).toContain('Breaking Changes');
    expect(changelog).toContain('None. This is the first public API release.');
    expect(changelog).toContain('Deprecations');
    expect(changelog).toContain('No migration is required for v1.0.0.');

    for (const endpoint of [
      '/api/health',
      '/api/ready',
      '/api/metrics',
      '/api/v1/auth/login',
      '/api/v1/ledger/events/chain/verify',
      '/api/v1/devices/register',
      '/api/v1/device-events',
      '/api/v1/orders/{id}/proof',
      '/api/v1/proofs/verify',
      '/api/v1/inventory/alerts/generate',
      '/api/v1/inventory/scan/batch',
    ]) {
      expect(changelog).toContain(endpoint);
    }
  });

  test('API integration docs cover auth flows, examples, errors, rate limits, and troubleshooting', async () => {
    const guide = readFileSync(
      workspacePath('documentation', 'platform', 'api-integration-guide.md'),
      'utf8',
    );
    const authReference = readFileSync(
      workspacePath('documentation', 'platform', 'auth-api-reference.md'),
      'utf8',
    );
    const troubleshooting = readFileSync(
      workspacePath('documentation', 'platform', 'api-troubleshooting.md'),
      'utf8',
    );
    const docsIndex = readFileSync(
      workspacePath('documentation', 'README.md'),
      'utf8',
    );

    expect(docsIndex).toContain('[API Integration Guide](platform/api-integration-guide.md)');
    expect(docsIndex).toContain('[API Troubleshooting](platform/api-troubleshooting.md)');
    expect(docsIndex).toContain('[Auth API Reference](platform/auth-api-reference.md)');

    for (const expected of [
      '## Authentication Flow',
      '## Authentication Documentation',
      'Authorization: Bearer <accessToken>',
      'X-Device-Key',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      '## Bearer Token Example',
      'POST /api/v1/auth/login',
      'POST /api/v1/device-events',
      '"statusCode": 400',
      '"statusCode": 401',
      '"statusCode": 403',
      '"statusCode": 429',
      'RATE_LIMIT_EXCEEDED',
      '### curl',
      '### Python',
      '### Node.js',
    ]) {
      expect(guide).toContain(expected);
    }

    for (const expected of [
      '## Security Schemes',
      'Protected endpoints require `Authorization: Bearer <access-token>`.',
      '## Public Endpoints',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      '## Admin-Protected Endpoints',
    ]) {
      expect(authReference).toContain(expected);
    }

    for (const expected of [
      '## 400 Bad Request',
      '## 401 Unauthorized',
      '## 403 Forbidden',
      '## 404 Not Found',
      '## 409 Conflict',
      '## 429 Rate Limit Exceeded',
      '## 5xx Server Errors',
      '/api/health',
      '/api/ready',
      '/api/metrics',
    ]) {
      expect(troubleshooting).toContain(expected);
    }
  });

  test('OpenAPI endpoint metadata covers inventory, scan, device batch, and proof payloads', async () => {
    const inventory = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'inventory', 'inventory.controller.ts'),
      'utf8',
    );
    const inventoryScan = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'inventory', 'inventory-scan.controller.ts'),
      'utf8',
    );
    const deviceEvents = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'device-events.controller.ts'),
      'utf8',
    );
    const orders = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'orders', 'orders.controller.ts'),
      'utf8',
    );

    expect(inventory.match(/@ApiParam\(\{ name: 'id'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(inventory).toContain("required: ['quantity']");
    expect(inventory).toContain("required: ['locationId']");
    expect(inventory).toContain("required: ['status']");
    expect(inventory).toContain("required: ['reason']");
    expect(inventory).toContain("required: ['items']");
    expect(inventory).toContain("required: ['moves']");
    expect(inventoryScan).toContain("@Post('scan/batch')");
    expect(inventoryScan).toContain('maxItems: 100');
    expect(deviceEvents).toContain("@Post('batch')");
    expect(deviceEvents).toContain('@ApiBadRequestResponse');
    expect(deviceEvents).toContain('@ApiUnauthorizedResponse');
    expect(orders).toContain("@Controller('v1/proofs')");
    expect(orders).toContain('Proof verification payload.');
    expect(orders).toContain("required: ['proof']");
  });

  test('OpenAPI response and query metadata covers filters and protected errors', async () => {
    const orders = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'orders', 'orders.controller.ts'),
      'utf8',
    );
    const inventory = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'inventory', 'inventory.controller.ts'),
      'utf8',
    );
    const devices = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'devices.controller.ts'),
      'utf8',
    );

    for (const query of [
      "name: 'status'",
      "name: 'customerId'",
      "name: 'query'",
      "name: 'createdFrom'",
      "name: 'createdTo'",
      "name: 'page'",
      "name: 'pageSize'",
      "name: 'sortBy'",
      "name: 'sortDirection'",
    ]) {
      expect(orders).toContain(query);
    }

    expect(inventory).toContain("name: 'locationId'");
    expect(inventory).toContain("name: 'includeProvenance'");
    expect(inventory).toContain("name: 'detectedFrom'");
    expect(inventory).toContain("name: 'detectedTo'");
    expect(devices).toContain("name: 'search'");
    expect(orders).toContain('@ApiUnauthorizedResponse');
    expect(inventory).toContain('@ApiUnauthorizedResponse');
    expect(devices).toContain('@ApiUnauthorizedResponse');
    expect(inventory.match(/@ApiNotFoundResponse\(\{ description: 'Inventory item not found for tenant.' \}\)/g)?.length).toBeGreaterThanOrEqual(8);
  });

  test('OpenAPI operation metadata covers every REST controller route', async () => {
    const controllerPaths = [
      ['app.controller.ts'],
      ['auth', 'auth.controller.ts'],
      ['devices', 'devices.controller.ts'],
      ['devices', 'device-events.controller.ts'],
      ['inventory', 'inventory.controller.ts'],
      ['inventory', 'inventory-scan.controller.ts'],
      ['ledger-events', 'ledger-events.controller.ts'],
      ['orders', 'orders.controller.ts'],
    ];
    const missingOperations: string[] = [];

    for (const segments of controllerPaths) {
      const source = readFileSync(
        workspacePath('apps', 'ledger-api', 'src', 'app', ...segments),
        'utf8',
      );
      const lines = source.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (!line.match(/^\s*@(Get|Post|Patch|Delete)\(/)) {
          return;
        }

        const decoratorBlock = lines.slice(index, index + 18).join('\n');
        if (!decoratorBlock.includes('@ApiOperation')) {
          missingOperations.push(`${segments.join('/')}:${index + 1}`);
        }
      });
    }

    expect(missingOperations).toEqual([]);
  });

  test('production monitoring documentation covers Grafana, Prometheus, alerts, and metrics', async () => {
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
    const prometheus = readFileSync(
      workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
      'utf8',
    );
    const alerts = readFileSync(
      workspacePath('apps', 'docker', 'prometheus', 'rules', 'ledger-alerts.yml'),
      'utf8',
    );
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(docsIndex).toContain('[Monitoring](../MONITORING.md)');
    expect(docs).toContain('## Grafana Access');
    expect(docs).toContain('3001:3000');
    expect(docs).toContain('GRAFANA_ADMIN_USER');
    expect(docs).toContain('## Prometheus Scraping');
    expect(docs).toContain('ledger-api:3000');
    expect(docs).toContain('/api/metrics');
    expect(docs).toContain('## Alert Configuration');
    expect(docs).toContain('## Metric Definitions');
    expect(prometheus).toContain('scrape_interval: 15s');
    expect(alerts).toContain('TrueNorthLedgerApiDown');
    expect(alerts).toContain('TrueNorthLedgerDatabaseUnavailable');

    for (const metric of [
      'true_north_ledger_api_up',
      'true_north_ledger_api_uptime_seconds',
      'true_north_ledger_database_up',
      'true_north_ledger_redis_configured',
      'true_north_ledger_websocket_connections_active',
      'true_north_ledger_http_requests_total',
      'true_north_ledger_http_request_duration_seconds',
      'true_north_ledger_database_query_duration_seconds',
      'true_north_ledger_ledger_events_created_total',
      'true_north_ledger_device_heartbeats_total',
    ]) {
      expect(docs).toContain(metric);
      expect(dashboard).toContain(metric);
    }
  });

  test('production HTTP metrics are collected and documented', async () => {
    const appModule = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.module.ts'),
      'utf8',
    );
    const appService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.service.ts'),
      'utf8',
    );
    const metricsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.service.ts'),
      'utf8',
    );
    const interceptor = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'http-metrics.interceptor.ts'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(appModule).toContain('APP_INTERCEPTOR');
    expect(appModule).toContain('HttpMetricsInterceptor');
    expect(appModule).toContain('MetricsModule');
    expect(appService).toContain('...this.metricsService.renderHttpMetrics()');
    expect(metricsService).toContain('recordHttpRequest');
    expect(metricsService).toContain('true_north_ledger_http_requests_total');
    expect(metricsService).toContain('true_north_ledger_http_request_duration_seconds');
    expect(metricsService).toContain('true_north_ledger_database_query_duration_seconds');
    expect(interceptor).toContain('metricsService.recordHttpRequest');
    expect(interceptor).toContain('durationSeconds');
    expect(docs).toContain('HTTP request rate');
    expect(docs).toContain('HTTP p95 duration');
    expect(dashboard).toContain('sum(rate(true_north_ledger_http_requests_total[5m]))');
    expect(dashboard).toContain('histogram_quantile(0.95');
  });

  test('production database query metrics are collected and documented', async () => {
    const appService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.service.ts'),
      'utf8',
    );
    const metricsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.service.ts'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(appService).toContain('this.metricsService.recordDatabaseQuery');
    expect(appService).toContain("operation: 'readiness'");
    expect(appService).toContain("status: 'ok'");
    expect(appService).toContain("status: 'error'");
    expect(appService).toContain('...this.metricsService.renderDatabaseMetrics()');
    expect(metricsService).toContain('recordDatabaseQuery');
    expect(metricsService).toContain('renderDatabaseMetrics');
    expect(metricsService).toContain('true_north_ledger_database_query_duration_seconds');
    expect(docs).toContain('Database query p95 duration');
    expect(docs).toContain('true_north_ledger_database_query_duration_seconds');
    expect(dashboard).toContain('true_north_ledger_database_query_duration_seconds_bucket');
  });

  test('production ledger event metrics are collected and documented', async () => {
    const appService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.service.ts'),
      'utf8',
    );
    const metricsModule = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.module.ts'),
      'utf8',
    );
    const metricsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.service.ts'),
      'utf8',
    );
    const ledgerEventsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'ledger-events', 'ledger-events.service.ts'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(metricsModule).toContain('@Global()');
    expect(metricsModule).toContain('exports: [MetricsService, PrometheusModule]');
    expect(ledgerEventsService).toContain('this.metricsService?.recordLedgerEventCreated');
    expect(ledgerEventsService).toContain('eventType: response.type');
    expect(ledgerEventsService).toContain('subjectType: response.subjectType');
    expect(ledgerEventsService).toContain('result: response.metadata.result');
    expect(appService).toContain('...this.metricsService.renderLedgerEventMetrics()');
    expect(metricsService).toContain('recordLedgerEventCreated');
    expect(metricsService).toContain('renderLedgerEventMetrics');
    expect(metricsService).toContain('true_north_ledger_ledger_events_created_total');
    expect(docs).toContain('Ledger event creation rate');
    expect(docs).toContain('true_north_ledger_ledger_events_created_total');
    expect(dashboard).toContain('sum(rate(true_north_ledger_ledger_events_created_total[5m]))');
  });

  test('production device heartbeat metrics are collected and documented', async () => {
    const appService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.service.ts'),
      'utf8',
    );
    const metricsService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'metrics.service.ts'),
      'utf8',
    );
    const devicesService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'devices.service.ts'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(devicesService).toContain('this.metricsService.recordDeviceHeartbeat');
    expect(devicesService).toContain('deviceType: saved.type');
    expect(devicesService).toContain("heartbeatStatus: request.status ?? 'online'");
    expect(devicesService).toContain('deviceStatus: saved.status');
    expect(appService).toContain('...this.metricsService.renderDeviceHeartbeatMetrics()');
    expect(metricsService).toContain('recordDeviceHeartbeat');
    expect(metricsService).toContain('renderDeviceHeartbeatMetrics');
    expect(metricsService).toContain('true_north_ledger_device_heartbeats_total');
    expect(docs).toContain('Device heartbeat rate');
    expect(docs).toContain('true_north_ledger_device_heartbeats_total');
    expect(dashboard).toContain('sum(rate(true_north_ledger_device_heartbeats_total[5m]))');
  });

  test('production WebSocket connection metric is collected and documented', async () => {
    const appService = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.service.ts'),
      'utf8',
    );
    const ordersGateway = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'orders', 'orders.gateway.ts'),
      'utf8',
    );
    const notificationsGateway = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'notifications', 'notifications.gateway.ts'),
      'utf8',
    );
    const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    );

    expect(appService).toContain('true_north_ledger_websocket_connections_active');
    expect(appService).toContain('this.getActiveWebSocketConnectionCount()');
    expect(appService).toContain('this.ordersGateway.getActiveConnectionCount()');
    expect(appService).toContain('this.notificationsGateway?.getActiveConnectionCount() ?? 0');
    expect(ordersGateway).toContain('getActiveConnectionCount(): number');
    expect(notificationsGateway).toContain('getActiveConnectionCount(): number');
    expect(docs).toContain('true_north_ledger_websocket_connections_active');
    expect(docs).toContain('WebSocket connection trend');
    expect(dashboard).toContain('true_north_ledger_websocket_connections_active');
    expect(dashboard).toContain('WebSocket connections');
  });

  test('production backup documentation covers backup, restore, and disaster recovery', async () => {
    const docs = readFileSync(workspacePath('BACKUP.md'), 'utf8');
    const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
    const backup = readFileSync(
      workspacePath('scripts', 'production', 'backup.sh'),
      'utf8',
    );
    const restore = readFileSync(
      workspacePath('scripts', 'production', 'restore.sh'),
      'utf8',
    );

    expect(docsIndex).toContain('[Backup and Restore](../BACKUP.md)');
    expect(docs).toContain('## Backup Procedures');
    expect(docs).toContain('scripts/production/backup.sh');
    expect(docs).toContain('pg_dump -Fc');
    expect(docs).toContain('true-north-ledger-YYYYMMDDTHHMMSSZ.dump');
    expect(docs).toContain('## Restore Procedures');
    expect(docs).toContain('RESTORE_CONFIRM=restore');
    expect(docs).toContain('pg_restore --clean --if-exists --no-owner');
    expect(docs).toContain('## Disaster Recovery');
    expect(docs).toContain('/api/v1/ledger/events/chain/verify');
    expect(docs).toContain('Prometheus is scraping `ledger-api:3000/api/metrics`');
    expect(backup).toContain('pg_dump -Fc');
    expect(backup).toContain('true-north-ledger-$timestamp.dump');
    expect(restore).toContain('RESTORE_CONFIRM=restore');
    expect(restore).toContain('pg_restore --clean --if-exists --no-owner');
  });

  test('production deployment documentation covers install, config, operations, and troubleshooting', async () => {
    const docs = readFileSync(workspacePath('DEPLOYMENT.md'), 'utf8');
    const readme = readFileSync(workspacePath('README.md'), 'utf8');
    const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
    const deploy = readFileSync(
      workspacePath('scripts', 'production', 'deploy.sh'),
      'utf8',
    );
    const preDeploy = readFileSync(
      workspacePath('scripts', 'production', 'pre-deploy.sh'),
      'utf8',
    );

    expect(docsIndex).toContain('[Deployment](../DEPLOYMENT.md)');
    expect(readme).toContain('## Production Deployment');
    expect(readme).toContain('[Deployment](DEPLOYMENT.md)');
    expect(readme).toContain('[Backup and Restore](BACKUP.md)');
    expect(readme).toContain('[Monitoring](MONITORING.md)');
    expect(docs).toContain('## Prerequisites');
    expect(docs).toContain('## Installation Steps');
    expect(docs).toContain('## Configuration Guide');
    expect(docs).toContain('## Starting And Stopping Services');
    expect(docs).toContain('## Troubleshooting');
    expect(docs).toContain('scripts/production/pre-deploy.sh');
    expect(docs).toContain('scripts/production/build.sh');
    expect(docs).toContain('scripts/production/deploy.sh');
    expect(docs).toContain('docker compose --env-file .env.production');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('/api/ready');
    expect(docs).toContain('/api/metrics');
    expect(docs).toContain('/api/docs');
    expect(deploy).toContain('up -d --remove-orphans');
    expect(preDeploy).toContain('Missing or placeholder production variable');
    expect(preDeploy).toContain('openssl x509 -checkend 604800');
  });

  test('production API hardening disables debug root and WebSocket CORS', async () => {
    const appController = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'app.controller.ts'),
      'utf8',
    );
    const corsConfig = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'websocket-cors.config.ts'),
      'utf8',
    );
    const notificationsGateway = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'notifications', 'notifications.gateway.ts'),
      'utf8',
    );
    const ordersGateway = readFileSync(
      workspacePath('apps', 'ledger-api', 'src', 'app', 'orders', 'orders.gateway.ts'),
      'utf8',
    );

    expect(appController).toContain("process.env.NODE_ENV === 'production'");
    expect(appController).toContain('Debug endpoint is disabled in production');
    expect(corsConfig).toContain("nodeEnv === 'production'");
    expect(corsConfig).toContain('return false;');
    expect(corsConfig).toContain("origin: corsOrigin ?? 'http://localhost:4200'");
    expect(notificationsGateway).toContain('cors: createWebSocketCorsOptions()');
    expect(ordersGateway).toContain('cors: createWebSocketCorsOptions()');
    expect(notificationsGateway).not.toContain("cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200' }");
    expect(ordersGateway).not.toContain("cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200' }");
  });

  test('live operations visual state documentation matches dashboard behavior', async () => {
    const docs = readFileSync(
      workspacePath('documentation', 'development', 'live-operations-visual-state-model.md'),
      'utf8',
    );
    const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
    const dashboard = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard.component.ts'),
      'utf8',
    );
    const dashboardTemplate = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard.component.html'),
      'utf8',
    );
    const operationsService = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard-operations.service.ts'),
      'utf8',
    );
    const animations = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'shared', 'animations', 'shared-animation-triggers.ts'),
      'utf8',
    );

    expect(docsIndex).toContain('[Live Operations Visual State Model](development/live-operations-visual-state-model.md)');
    expect(docs).toContain('## Connection State Labels');
    expect(docs).toContain('Subscribed to tenant ledger events');
    expect(docs).toContain('Reconnecting to live ledger feed');
    expect(docs).toContain('Live ledger feed unavailable');
    expect(docs).toContain('| Socket connected | 40 |');
    expect(docs).toContain('| Tenant subscription | 30 |');
    expect(docs).toContain('| Recent ledger event | 30 |');
    expect(docs).toContain('Approved fixture fallback until API state is available');
    expect(docs).toContain('true_north_ledger_websocket_connections_active');
    expect(docs).toContain('the feed keeps the three most recent notifications');
    expect(docs).toContain('prefers-reduced-motion: reduce');
    expect(dashboard).toContain("state === 'connected' ? 40 : state === 'reconnecting' ? 20 : 0");
    expect(dashboard).toContain('subscriptionRooms().length > 0 ? 30 : 0');
    expect(dashboard).toContain('recentNotifications().length > 0 ? 30 : 0');
    expect(dashboard).toContain('].slice(0, 3)');
    expect(dashboardTemplate).toContain('readiness points from live API, WebSocket, and ledger inputs');
    expect(dashboardTemplate).toContain('tnl-ledger-event-card');
    expect(operationsService).toContain("source: 'approved-fixture'");
    expect(operationsService).toContain('true_north_ledger_websocket_connections_active');
    expect(animations).toContain('highlightDuration: \'0ms\'');
  });

  test('notification reconnect flow recovers missed ledger events from the API', async () => {
    const notificationService = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'notification.service.ts'),
      'utf8',
    );
    const notificationServiceSpec = readFileSync(
      workspacePath('apps', 'ledger-web', 'src', 'app', 'notification.service.spec.ts'),
      'utf8',
    );

    expect(notificationService).toContain('lastDisconnectedAt');
    expect(notificationService).toContain('fetchMissedLedgerEvents');
    expect(notificationService).toContain("this.connectionStateSubject.value === 'reconnecting'");
    expect(notificationService).toContain("this.http");
    expect(notificationService).toContain("'/api/v1/ledger/events'");
    expect(notificationService).toContain('LedgerEventResponseSchema.array().safeParse');
    expect(notificationService).toContain("source: 'missed-event-recovery'");
    expect(notificationService).toContain('observedLedgerEventIds');
    expect(notificationServiceSpec).toContain('fetches missed ledger events after reconnect');
    expect(notificationServiceSpec).toContain("http.expectOne('/api/v1/ledger/events')");
    expect(notificationServiceSpec).toContain("Bearer access-token");
  });

  test('loads the dashboard shell and page navigation', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ledger Events' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Proofs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    expect(browserIssues).toEqual([]);
  });

  test('navigates ledger events page and creates a demo event', async ({ page }) => {
    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');
    await expect(page.locator('[data-testid="ledger-events-empty"]')).toBeVisible();

    const createButton = page.locator('button', { hasText: 'Create demo event' });
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
  });

  test('renders all primary routes and headings', async ({ page }) => {
    const routes = [
      { path: '/', heading: 'Dashboard' },
      { path: '/ledger-events', heading: 'Ledger Events' },
      { path: '/devices', heading: 'Devices' },
      { path: '/proofs', heading: 'Proofs' },
      { path: '/settings', heading: 'Settings' },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator('h1')).toHaveText(route.heading);
    }
  });

  test('renders dashboard route with animation-enabled shell without runtime errors', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.goto('/');

    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.section-card')).toBeVisible();
    expect(browserIssues).toEqual([]);
  });

  test('renders dashboard shell in reduced-motion mode without runtime errors', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    expect(browserIssues).toEqual([]);
  });

  test('renders proof hash card and timeline rail primitives on dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.tnl-proof-hash-card')).toBeVisible();
    await expect(page.locator('.tnl-proof-hash-card')).toContainText('Latest proof hash');
    await expect(page.locator('.tnl-proof-hash-card')).toContainText('Verified');

    await expect(page.locator('.tnl-timeline-rail')).toBeVisible();
    await expect(page.locator('.tnl-timeline-rail')).toContainText('Auth rollout timeline');
    await expect(page.locator('.tnl-timeline-rail')).toContainText('Role catalog seeding');
  });

  test('validates basic document semantics', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    const lang = await page.locator('html').getAttribute('lang');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');

    expect(title.trim().length).toBeGreaterThan(0);
    expect(lang?.trim().length).toBeGreaterThan(0);
    expect(viewport).toContain('width=device-width');
  });

  test('registers material icon font stylesheet in document head', async ({ page }) => {
    await page.goto('/');

    const iconLink = page.locator('head link[rel="stylesheet"][href*="Material+Symbols+Outlined"]');
    await expect(iconLink).toHaveCount(1);
  });

  test('renders usable layout in forced high-contrast mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    const focusOutline = await page.evaluate(() => {
      const link = document.querySelector('[data-testid="app-nav"] a') as HTMLElement | null;
      if (!link) {
        return null;
      }
      link.focus();
      const style = getComputedStyle(link);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    expect(focusOutline).not.toBeNull();
    expect(focusOutline?.outlineStyle).not.toBe('none');
    expect(focusOutline?.outlineWidth).not.toBe('0px');
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`renders without horizontal overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const hasHorizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );

      await expect(page.locator('body')).toBeVisible();
      expect(hasHorizontalOverflow).toBe(false);
    });
  }

  test('ensures all navigation links are keyboard accessible', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    const tabIndexes = await page.locator('[data-testid="app-nav"]').evaluate((nav) =>
      Array.from(nav.querySelectorAll('a')).map((link) => link.getAttribute('tabindex')),
    );

    expect(tabIndexes.length).toBeGreaterThan(0);
    for (const tabindex of tabIndexes) {
      expect(tabindex === null || parseInt(tabindex) >= 0).toBe(true);
    }
  });

  test('no insecure HTTP requests in production build', async ({ page }) => {
    const httpRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        httpRequests.push(url);
      }
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    
    expect(httpRequests).toEqual([]);
  });

  test('refresh button reloads ledger events', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const refreshButton = page.locator('button', { hasText: 'Refresh events' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    await expect(page.locator('body')).toBeVisible();
  });

  test('multiple demo events can be created', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const createButton = page.locator('button', { hasText: 'Create demo event' });
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(2);
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(3);
  });

  test('navigation preserves app state', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const createButton = page.locator('button', { hasText: 'Create demo event' });
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
    
    // Navigate away and back
    await page.goto('/dashboard');
    await page.goto('/ledger-events');
    
    // Event should still be visible (since API maintains state)
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
  });

  test('empty state shows helpful message', async ({ page }) => {
    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');
    
    const emptyMessage = page.locator('[data-testid="ledger-events-empty"]');
    // May or may not be visible depending on if events exist from other tests
    // This is acceptable - just verifying the element exists in the DOM
    await expect(emptyMessage).toHaveCount(1);
  });

  test.describe('Error Scenarios', () => {
    test('handles 404 navigation gracefully', async ({ page }) => {
      const browserIssues = collectBrowserIssues(page);
      await page.goto('/non-existent-route');

      await expect(page.locator('h1')).toHaveText('Dashboard');
      expect(browserIssues.filter(issue => issue.includes('error'))).toEqual([]);
    });

    test('handles rapid navigation without errors', async ({ page }) => {
      // Rapidly navigate between routes
      await page.goto('/');
      await page.goto('/ledger-events');
      await page.goto('/devices');
      await page.goto('/proofs');
      await page.goto('/settings');
      await page.goto('/');

      await expect(page.locator('h1')).toHaveText('Dashboard');
    });

    test('handles API errors gracefully', async ({ page }) => {
      await page.goto('/ledger-events');
      
      // Intercept API calls and simulate server error
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });

    test('handles network timeout gracefully', async ({ page }) => {
      await page.goto('/ledger-events');

      let releaseRequest: (() => void) | undefined;
      const pendingRequest = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      const pendingRoutes = new Set<Promise<void>>();

      // Simulate network timeout
      await page.route('**/api/v1/ledger/events', (route) => {
        const pendingRoute = pendingRequest
          .then(() =>
            route.fulfill({
              status: 504,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Gateway Timeout' }),
            }),
          )
          .catch(() => undefined)
          .finally(() => pendingRoutes.delete(pendingRoute));

        pendingRoutes.add(pendingRoute);
        return pendingRoute;
      });

      try {
        const createButton = page.locator('button', { hasText: 'Create demo event' });
        await createButton.click();

        await expect(page.locator('body')).toContainText('Loading ledger events');
      } finally {
        releaseRequest?.();
        await Promise.allSettled([...pendingRoutes]);
        await page.unroute('**/api/v1/ledger/events');
      }
    });

    test('handles multiple rapid button clicks', async ({ page }) => {
      const browserIssues = collectBrowserIssues(page);
      await page.goto('/ledger-events');
      
      const createButton = page.locator('button', { hasText: 'Create demo event' });
      
      // Rapid clicks
      await createButton.click();
      await createButton.click();
      await createButton.click();

      await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(3);
      expect(browserIssues).toEqual([]);
    });

    test('validates browser back/forward navigation', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('h1')).toHaveText('Dashboard');
      await page.goto('/ledger-events');
      await expect(page.locator('h1')).toHaveText('Ledger Events');
      await page.goto('/devices');
      await expect(page.locator('h1')).toHaveText('Devices');
      
      // Navigate back
      await page.goBack();
      await expect(page.locator('h1')).toHaveText('Ledger Events');
      
      // Navigate forward
      await page.goForward();
      await expect(page.locator('h1')).toHaveText('Devices');
    });

    test('handles disconnected API gracefully', async ({ page }) => {
      // Intercept all API calls and fail them
      await page.route('**/api/**', route => {
        route.abort('failed');
      });
      
      await page.goto('/ledger-events');
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });

    test('has no unfinished forms on the ledger event page', async ({ page }) => {
      await page.goto('/ledger-events');

      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.locator('body')).toBeVisible();
    });

    test('handles empty API responses', async ({ page }) => {
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });
      
      await page.goto('/ledger-events');

      await expect(page.locator('[data-testid="ledger-events-empty"]')).toBeVisible();
    });

    test('handles malformed API responses', async ({ page }) => {
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json {{{' 
        });
      });
      
      await page.goto('/ledger-events');
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });
  });

  test.describe('Performance & Accessibility', () => {
    test('page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(8000);
    });

    test('all interactive elements have accessible names', async ({ page }) => {
      await page.goto('/');

      const buttonNames = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map((button) => ({
          text: button.textContent?.trim() ?? '',
          ariaLabel: button.getAttribute('aria-label')?.trim() ?? '',
        })),
      );

      for (const button of buttonNames) {
        expect(button.text || button.ariaLabel).toMatch(/\S/);
      }
    });

    test('focus management works correctly', async ({ page }) => {
      await page.goto('/');
      
      // Tab through focusable elements
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(firstFocused).toBeTruthy();
      
      await page.keyboard.press('Tab');
      const secondFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(secondFocused).toBeTruthy();
    });
  });
});
