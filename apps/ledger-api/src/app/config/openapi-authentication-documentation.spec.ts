import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('OpenAPI authentication documentation', () => {
  const openApiConfig = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'openapi.config.ts'),
    'utf8',
  );
  const authController = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'auth', 'auth.controller.ts'),
    'utf8',
  );
  const devicesController = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'devices.controller.ts'),
    'utf8',
  );
  const deviceEventsController = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'devices', 'device-events.controller.ts'),
    'utf8',
  );
  const inventoryScanController = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'inventory', 'inventory-scan.controller.ts'),
    'utf8',
  );
  const integrationGuide = readFileSync(
    workspacePath('documentation', 'platform', 'api-integration-guide.md'),
    'utf8',
  );
  const authReference = readFileSync(
    workspacePath('documentation', 'platform', 'auth-api-reference.md'),
    'utf8',
  );
  const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');

  it('defines JWT and device-key security schemes in the OpenAPI document', () => {
    expect(openApiConfig).toContain('.addBearerAuth(');
    expect(openApiConfig).toContain("bearerFormat: 'JWT'");
    expect(openApiConfig).toContain("'jwt'");
    expect(openApiConfig).toContain('.addApiKey(');
    expect(openApiConfig).toContain("name: 'X-Device-Key'");
    expect(openApiConfig).toContain("'device-key'");
  });

  it('annotates protected auth and device endpoints with their required auth mechanism', () => {
    expect(authController).toContain("@ApiBearerAuth('jwt')");
    expect(authController).toContain("@Post('login')");
    expect(authController).toContain("@Post('refresh')");
    expect(authController).toContain("@Post('logout')");
    expect(authController).toContain('extractBearerToken');
    expect(devicesController).toContain("@ApiSecurity('device-key')");
    expect(deviceEventsController).toContain("@ApiSecurity('device-key')");
    expect(inventoryScanController).toContain("@ApiSecurity('device-key')");
  });

  it('publishes integration and reference docs for bearer, refresh, logout, and device auth', () => {
    expect(docsIndex).toContain('[Auth API Reference](platform/auth-api-reference.md)');
    expect(integrationGuide).toContain('## Authentication Documentation');
    expect(integrationGuide).toContain('Authorization: Bearer <accessToken>');
    expect(integrationGuide).toContain('POST /api/v1/auth/refresh');
    expect(integrationGuide).toContain('POST /api/v1/auth/logout');
    expect(integrationGuide).toContain('X-Device-Key');
    expect(authReference).toContain('## Security Schemes');
    expect(authReference).toContain('Protected endpoints require `Authorization: Bearer <access-token>`.');
    expect(authReference).toContain('## Public Endpoints');
    expect(authReference).toContain('## Admin-Protected Endpoints');
  });
});
