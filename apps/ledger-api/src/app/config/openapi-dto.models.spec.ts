import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openApiDtoModels } from './openapi-dto.models';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('OpenAPI DTO models', () => {
  const source = readFileSync(
    workspacePath('apps', 'ledger-api', 'src', 'app', 'config', 'openapi-dto.models.ts'),
    'utf8',
  );
  const main = readFileSync(workspacePath('apps', 'ledger-api', 'src', 'main.ts'), 'utf8');

  it('registers the DTO model catalogue with Swagger document generation', () => {
    expect(openApiDtoModels.length).toBeGreaterThanOrEqual(12);
    expect(main).toContain('openApiDtoModels');
    expect(main).toContain('extraModels: openApiDtoModels');
  });

  it('decorates required and optional DTO fields with examples', () => {
    for (const expected of [
      'OpenApiLoginRequestDto',
      'OpenApiAuthResponseDto',
      'OpenApiLedgerEventResponseDto',
      'OpenApiAppendLedgerEventDto',
      'OpenApiDeviceRegistrationRequestDto',
      'OpenApiCreateOrderRequestDto',
      'OpenApiInventoryItemRequestDto',
      'OpenApiInventoryScanRequestDto',
    ]) {
      expect(source).toContain(`class ${expected}`);
    }

    expect(source).toContain('ApiProperty');
    expect(source).toContain('ApiPropertyOptional');
    expect(source.match(/@ApiProperty\(\{[^)]*example:/gs)?.length).toBeGreaterThanOrEqual(20);
    expect(source.match(/@ApiPropertyOptional\(\{[^)]*example:/gs)?.length).toBeGreaterThanOrEqual(8);
    expect(source).toContain('export const openApiDtoModels');
  });
});
