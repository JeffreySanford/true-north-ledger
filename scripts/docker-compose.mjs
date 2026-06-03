import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

const composeFile = join('apps', 'docker', 'docker-compose.yml');
const localEnvFile = '.env.development';
const args = process.argv.slice(2);

if (existsSync(localEnvFile)) {
  config({ path: localEnvFile });
}

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function composeArgs(extraArgs) {
  return ['-p', 'true-north-ledger', '-f', composeFile, ...extraArgs];
}

if (!existsSync(composeFile)) {
  console.error(`Missing compose file: ${composeFile}`);
  process.exit(1);
}

const modern = run('docker', ['compose', ...composeArgs(args)]);

if (modern.error) {
  throw modern.error;
}

if (modern.status === 0) {
  process.exit(0);
}

const legacy = run('docker-compose', composeArgs(args));

if (legacy.error) {
  throw legacy.error;
}

process.exit(legacy.status ?? 1);
