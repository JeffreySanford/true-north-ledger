import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const socketBaseUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((apiUrl) => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
    window.localStorage.setItem('tnl.socketBaseUrl', apiUrl);
    window.localStorage.setItem('tnl.authToken', 'dashboard-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '11111111-1111-4111-8111-111111111111',
        permissions: ['ledger.read', 'inventory.read', 'devices.read'],
      }),
    );
  }, socketBaseUrl);
});

test('dashboard live operations board renders API-seeded demo mode signals', async ({ page }) => {
  await page.route('**/api/metrics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'true_north_ledger_websocket_connections_active 6\n',
    }),
  );
  await page.route('**/api/v1/inventory/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        anomalies: [
          {
            id: '550e8400-e29b-41d4-a716-446655440101:low_stock',
            itemId: '550e8400-e29b-41d4-a716-446655440101',
            sku: 'SKU-LOW',
            name: 'Low stock sensor',
            type: 'low_stock',
            severity: 'warning',
            status: 'open',
            message: 'Low stock',
            locationId: 'AUSTIN-A1',
            locationName: 'Austin Warehouse - Aisle A1',
            detectedAt: '2026-06-25T12:00:00.000Z',
            remediation: 'Replenish inventory.',
            details: { quantity: 2, minimumQuantity: 5 },
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440102:missing_scan',
            itemId: '550e8400-e29b-41d4-a716-446655440102',
            sku: 'SKU-MISS',
            name: 'Missing scan sensor',
            type: 'missing_scan',
            severity: 'warning',
            status: 'open',
            message: 'Missing scan',
            locationId: 'AUSTIN-B2',
            locationName: 'Austin Warehouse - Aisle B2',
            detectedAt: '2026-06-25T12:00:00.000Z',
            remediation: 'Scan inventory.',
            details: { daysSinceLastScan: 45 },
          },
        ],
        total: 2,
      }),
    }),
  );
  await page.route('**/api/v1/devices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        devices: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Dock scanner',
            type: 'scanner',
            tenantId: '11111111-1111-4111-8111-111111111111',
            status: 'active',
            permissions: ['device.heartbeat.write'],
            metadata: {},
            lastSeenAt: '2026-06-25T12:00:00.000Z',
            online: true,
            createdAt: '2026-06-25T12:00:00.000Z',
            updatedAt: '2026-06-25T12:00:00.000Z',
            revokedAt: null,
            heartbeatFailureCount: 0,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            name: 'Tablet station',
            type: 'tablet',
            tenantId: '11111111-1111-4111-8111-111111111111',
            status: 'active',
            permissions: ['device.heartbeat.write'],
            metadata: {},
            lastSeenAt: null,
            online: false,
            createdAt: '2026-06-25T12:00:00.000Z',
            updatedAt: '2026-06-25T12:00:00.000Z',
            revokedAt: null,
            heartbeatFailureCount: 2,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    }),
  );

  await page.goto('/dashboard');

  const signals = page.getByTestId('live-operations-signals');
  await expect(signals).toContainText('Live API state');
  await expect(signals).toContainText('6 active connections');
  await expect(signals).toContainText('2 open anomalies');
  await expect(signals).toContainText('1 online / 1 missing heartbeat');
});

test('notification center shows terminal connection state with manual retry action', async ({ page }) => {
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/metrics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'true_north_ledger_websocket_connections_active 0\n',
    }),
  );
  await page.route('**/api/v1/inventory/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ anomalies: [], total: 0 }),
    }),
  );
  await page.route('**/api/v1/devices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ devices: [], total: 0, page: 1, pageSize: 100 }),
    }),
  );

  await page.goto('/dashboard');

  await expect(page.getByTestId('secure-session')).toBeVisible();
  await expect(page.getByTestId('notification-state')).toContainText('Failed', {
    timeout: 15_000,
  });
  const retry = page.getByTestId('notification-retry');
  await expect(retry).toBeVisible();

  await retry.click();

  await expect(page.getByTestId('notification-state')).toContainText('Reconnecting');
});

test('notification center persists opt-in sound preference', async ({ page }) => {
  await page.route('**/socket.io/**', (route) => route.abort());
  await stubDashboardOperationsApis(page);

  await page.goto('/dashboard');

  const soundToggle = page.getByTestId('notification-sound-toggle');
  await expect(soundToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(soundToggle).toHaveAttribute('aria-label', 'Enable notification sound');

  await soundToggle.click();

  await expect(soundToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(soundToggle).toHaveAttribute('aria-label', 'Disable notification sound');
  await expect(page.evaluate(() => window.localStorage.getItem('tnl.notificationSoundEnabled')))
    .resolves.toBe('true');
});

test('notification center renders connected and reconnecting states during transport interruption', async ({
  page,
  request,
}) => {
  const session = await loginAsAdmin(request);
  await stubDashboardOperationsApis(page);
  await page.addInitScript((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, session);

  await page.goto('/dashboard');

  const state = page.getByTestId('notification-state');
  await expect(state).toContainText('Connected');

  const observedStates = new Set<string>();
  const observeStates = page.evaluate(async () => {
    const labels: string[] = [];
    const stateElement = document.querySelector('[data-testid="notification-state"]');
    const startedAt = Date.now();

    while (Date.now() - startedAt < 4_000) {
      const text = stateElement?.textContent?.trim();
      if (text) {
        labels.push(text);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    return labels;
  });

  await page.route('**/socket.io/**', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.context().setOffline(true);

  for (const label of await observeStates) {
    observedStates.add(label);
  }

  expect(Array.from(observedStates)).toContain('Reconnecting');
  await page.context().setOffline(false);
});

async function stubDashboardOperationsApis(page: Page): Promise<void> {
  await page.route('**/api/metrics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'true_north_ledger_websocket_connections_active 0\n',
    }),
  );
  await page.route('**/api/v1/inventory/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ anomalies: [], total: 0 }),
    }),
  );
  await page.route('**/api/v1/devices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ devices: [], total: 0, page: 1, pageSize: 100 }),
    }),
  );
}

async function loginAsAdmin(request: APIRequestContext): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { tenantId: string };
}> {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(`${apiBaseUrl()}/api/v1/auth/login`, {
      data: { username: 'admin', password: 'admin' },
    });
    lastStatus = response.status();
    if (response.ok()) {
      return (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        user: { tenantId: string };
      };
    }
    if (lastStatus !== 429) {
      break;
    }
    await pageWait(1_000 * (attempt + 1));
  }

  throw new Error(`Admin login failed with status ${lastStatus}`);
}

function apiBaseUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function pageWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
