import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('OpenAPI endpoint metadata', () => {
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

  it('documents inventory write endpoint path params and request bodies', () => {
    for (const route of [
      "@Patch(':id/reserve')",
      "@Patch(':id/release')",
      "@Patch(':id/move')",
      "@Patch(':id/quantity')",
      "@Patch(':id/status')",
      "@Delete(':id')",
    ]) {
      expect(inventory).toContain(route);
    }

    expect(inventory.match(/@ApiParam\(\{ name: 'id'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(inventory).toContain("required: ['quantity']");
    expect(inventory).toContain("required: ['locationId']");
    expect(inventory).toContain("required: ['status']");
    expect(inventory).toContain("required: ['reason']");
  });

  it('documents batch/import request bodies and scan payloads', () => {
    expect(inventory).toContain("@Post('import')");
    expect(inventory).toContain("required: ['items']");
    expect(inventory).toContain("@Post('move/batch')");
    expect(inventory).toContain("required: ['moves']");
    expect(inventoryScan).toContain("@Post('scan/batch')");
    expect(inventoryScan).toContain('maxItems: 100');
    expect(inventoryScan).toContain("required: ['value', 'scanType']");
  });

  it('documents device batch error responses and proof verification body', () => {
    expect(deviceEvents).toContain("@Post('batch')");
    expect(deviceEvents).toContain('@ApiBadRequestResponse');
    expect(deviceEvents).toContain('@ApiUnauthorizedResponse');
    expect(orders).toContain("@Controller('v1/proofs')");
    expect(orders).toContain("@Post('verify')");
    expect(orders).toContain('Proof verification payload.');
    expect(orders).toContain("required: ['proof']");
  });
});
