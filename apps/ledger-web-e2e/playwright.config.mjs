import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const filename = fileURLToPath(import.meta.url);

loadEnv({ path: join(workspaceRoot, '.env.development'), quiet: true });

const baseURL = process.env.BASE_URL || 'http://localhost:4200';
const apiURL = process.env.API_URL || 'http://localhost:3000';
const readinessURL = `${apiURL.replace(/\/$/, '')}/api`;

export default defineConfig({
  ...nxE2EPreset(filename, { testDir: './src' }),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start:full',
    url: readinessURL,
    reuseExistingServer: true,
    cwd: workspaceRoot,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
