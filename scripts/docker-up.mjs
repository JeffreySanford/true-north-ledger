import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

const composeFile = join('apps', 'docker', 'docker-compose.yml');
const localEnvFile = '.env.development';
const containers = [
  { name: 'true-north-ledger-db', service: 'postgres' },
  { name: 'true-north-ledger-redis', service: 'redis' },
  { name: 'true-north-ledger-pgadmin', service: 'pgadmin' },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function dockerComposeArgs(args) {
  return ['-p', 'true-north-ledger', '-f', composeFile, ...args];
}

function runCompose(args) {
  const modern = run('docker', ['compose', ...dockerComposeArgs(args)], {
    capture: true,
  });

  if (modern.status === 0) {
    process.stdout.write(modern.stdout);
    process.stderr.write(modern.stderr);
    return;
  }

  const legacy = run('docker-compose', dockerComposeArgs(args), { capture: true });
  process.stdout.write(legacy.stdout);
  process.stderr.write(legacy.stderr);

  if (legacy.status !== 0) {
    process.exitCode = legacy.status ?? 1;
  }
}

function inspectContainer(name) {
  const result = run('docker', ['inspect', name], { capture: true });
  if (result.status !== 0) {
    return undefined;
  }

  return JSON.parse(result.stdout)[0];
}

function isCleanRunning(container) {
  const state = container?.State;
  if (!state || state.Status !== 'running') {
    return false;
  }

  return !state.Health || state.Health.Status === 'healthy';
}

if (!existsSync(composeFile)) {
  console.error(`Missing compose file: ${composeFile}`);
  process.exit(1);
}

if (existsSync(localEnvFile)) {
  config({ path: localEnvFile });
}

const states = containers.map(({ name, service }) => ({
  name,
  service,
  container: inspectContainer(name),
}));
const unhealthy = states.filter(({ container }) => container && !isCleanRunning(container));
const allClean = states.every(({ container }) => isCleanRunning(container));

if (allClean) {
  console.log('Docker infrastructure is already running and healthy; skipping compose up.');
  process.exit(0);
}

if (unhealthy.length > 0) {
  console.log(
    `Recreating unhealthy infrastructure containers: ${unhealthy
      .map(({ name }) => name)
      .join(', ')}`,
  );
  for (const { name } of unhealthy) {
    const result = run('docker', ['rm', '-f', name], { capture: true });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

const refreshedStates = containers.map(({ name, service }) => ({
  name,
  service,
  container: inspectContainer(name),
}));
const missing = refreshedStates.filter(({ container }) => !container);
const healthy = refreshedStates.filter(({ container }) => isCleanRunning(container));

if (missing.length === 0) {
  console.log('Docker infrastructure is running and healthy.');
  process.exit(0);
}

if (healthy.length > 0) {
  const services = missing.map(({ service }) => service);
  console.log(`Starting missing infrastructure services: ${services.join(', ')}`);
  runCompose(['up', '-d', '--no-deps', ...services]);
} else {
  runCompose(['up', '-d']);
}
