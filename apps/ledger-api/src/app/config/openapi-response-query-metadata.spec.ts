import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('OpenAPI response and query metadata', () => {
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

  it('documents query parameters for list and search endpoints', () => {
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

    for (const query of [
      "name: 'locationId'",
      "name: 'includeProvenance'",
      "name: 'detectedFrom'",
      "name: 'detectedTo'",
      "name: 'severity'",
    ]) {
      expect(inventory).toContain(query);
    }

    expect(devices).toContain("name: 'search'");
    expect(devices).toContain("Devices per page, 1-100");
  });

  it('documents common protected-endpoint unauthorized responses', () => {
    expect(orders).toContain("@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })");
    expect(inventory).toContain("@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })");
    expect(devices).toContain("@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token or device key.' })");
  });

  it('documents inventory not-found responses on item-specific endpoints', () => {
    expect(inventory.match(/@ApiNotFoundResponse\(\{ description: 'Inventory item not found for tenant.' \}\)/g)?.length).toBeGreaterThanOrEqual(8);
    expect(inventory).toContain("@ApiParam({ name: 'sku'");
    expect(inventory).toContain("@ApiParam({ name: 'id', format: 'uuid'");
  });
});
