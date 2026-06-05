import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const endpoints = [
  { name: 'API', url: 'http://localhost:3000/api', port: 3000 },
  { name: 'Web', url: 'http://localhost:4200/', port: 4200 },
];

function request(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2_000 }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function getEndpointStates() {
  return Promise.all(
    endpoints.map(async (endpoint) => ({
      ...endpoint,
      running: await request(endpoint.url),
    })),
  );
}

function hasCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    shell: false,
  });

  return result.status === 0;
}

function pnpmSpawn(scriptName) {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm', scriptName],
    };
  }

  return {
    command: 'pnpm',
    args: [scriptName],
  };
}

function startWeb() {
  if (process.platform !== 'win32' && hasCommand('bash')) {
    return spawn('bash', ['-lc', 'pnpm start:web'], {
      stdio: 'inherit',
      shell: false,
    });
  }

  const pnpm = pnpmSpawn('start:web');
  return spawn(pnpm.command, pnpm.args, {
    stdio: 'inherit',
    shell: false,
  });
}

function startApi() {
  if (process.platform !== 'win32' && hasCommand('bash')) {
    return spawn('bash', ['-lc', 'pnpm start:api'], {
      stdio: 'inherit',
      shell: false,
    });
  }

  const pnpm = pnpmSpawn('start:api');
  return spawn(pnpm.command, pnpm.args, {
    stdio: 'inherit',
    shell: false,
  });
}

async function main() {
  const states = await getEndpointStates();
  const apiRunning = states.find((state) => state.name === 'API')?.running === true;
  const webRunning = states.find((state) => state.name === 'Web')?.running === true;

  if (apiRunning && webRunning) {
    console.log('API and web development servers are already running; leaving them in place.');
    for (const state of states.filter((state) => state.running)) {
      console.log(`- ${state.name}: ${state.url}`);
    }
    return;
  }

  let child;
  if (webRunning && !apiRunning) {
    console.log('Web server is running but API is unavailable; starting API server.');
    child = startApi();
  } else {
    if (apiRunning && !webRunning) {
      console.log('API is running but web server is unavailable; starting web server.');
    }

    child = startWeb();
  }

  const forwardSignal = (signal) => {
    if (!child.killed) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
        return;
      }

      child.kill(signal);
    }
  };

  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

  const result = await Promise.race([once(child, 'exit'), once(child, 'error')]);
  if (result[0] instanceof Error) {
    throw result[0];
  }

  const [code, signal] = result;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
