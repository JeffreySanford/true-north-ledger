import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

const controllerFiles = [
  ['app.controller.ts'],
  ['auth', 'auth.controller.ts'],
  ['devices', 'devices.controller.ts'],
  ['devices', 'device-events.controller.ts'],
  ['inventory', 'inventory.controller.ts'],
  ['inventory', 'inventory-scan.controller.ts'],
  ['ledger-events', 'ledger-events.controller.ts'],
  ['orders', 'orders.controller.ts'],
];

describe('OpenAPI operation coverage', () => {
  it('documents every REST controller route with an ApiOperation summary', () => {
    const missingOperations: string[] = [];

    for (const segments of controllerFiles) {
      const relativePath = segments.join('/');
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
          missingOperations.push(`${relativePath}:${index + 1}:${line.trim()}`);
        }
      });
    }

    expect(missingOperations).toEqual([]);
  });
});
