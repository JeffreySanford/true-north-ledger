import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { DeviceHardwareExamples } from '@true-north-ledger/shared-models';
import type { Device, DeviceRegistrationResponse, LedgerEventResponse } from '@true-north-ledger/shared-models';

const tenantId = '00000000-0000-0000-0000-000000000000';
const socketBaseUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function buildDevice(overrides: Partial<Device> = {}): Device {
  const now = new Date('2026-06-04T12:00:00.000Z').toISOString();
  return {
    id: randomUUID(),
    name: 'Receiving scanner',
    type: 'scanner',
    tenantId,
    status: 'active',
    permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    metadata: {},
    lastSeenAt: now,
    online: true,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    ...overrides,
  };
}

function buildRegistration(overrides: Partial<Device> = {}): DeviceRegistrationResponse {
  const now = new Date('2026-06-04T12:00:00.000Z').toISOString();
  const device = buildDevice(overrides);
  return {
    ...device,
    apiKey: 'tnl_dev_e2e_key',
    provisioningPayload: {
      version: 1,
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      tenantId: device.tenantId,
      apiKey: 'tnl_dev_e2e_key',
      heartbeatPath: '/api/v1/devices/heartbeat',
      deviceEventPath: '/api/v1/device-events',
      batchDeviceEventPath: '/api/v1/device-events/batch',
      issuedAt: now,
    },
    provisioningUri: 'tnl-device://provision?payload=e2e',
  };
}

function buildLedgerEvent(
  device: Device,
  action: string,
  sequence = 1,
  overrides: Partial<LedgerEventResponse> = {},
): LedgerEventResponse {
  const now = new Date().toISOString();
  const { payload, metadata, ...eventOverrides } = overrides;
  return {
    id: randomUUID(),
    type: 'DEVICE_LEDGER_EVENT',
    actorType: 'device',
    actorId: device.id,
    subjectType: 'device',
    subjectId: device.id,
    deviceId: device.id,
    deviceType: device.type,
    payload: { action, ...(payload ?? {}) },
    metadata: {
      tenantId,
      requestId: `request-${sequence}`,
      correlationId: `correlation-${sequence}`,
      userAgent: 'playwright',
      payloadHash: `payload-hash-${sequence}`,
      eventHash: `event-hash-${sequence}`,
      chainSequence: sequence,
      result: 'accepted',
      timestamp: now,
      ...(metadata ?? {}),
    },
    createdAt: now,
    ...eventOverrides,
  };
}

async function seedDeviceSession(page: Page): Promise<void> {
  await page.addInitScript((apiUrl) => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
    window.localStorage.setItem('tnl.socketBaseUrl', apiUrl);
    window.localStorage.setItem('tnl.authToken', 'device-admin-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['devices.read', 'devices.manage', 'ledger.read'],
      }),
    );
  }, socketBaseUrl);
}

test.beforeEach(async ({ page }) => {
  await seedDeviceSession(page);
});

test('device registry registers a device and displays one-time API key', async ({ page }) => {
  const devices: Device[] = [buildDevice()];

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/devices/register')) {
      const registered = buildRegistration({
          name: 'Gateway 01',
          type: 'gateway',
          online: false,
          lastSeenAt: null,
        });
      devices.unshift(registered);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(registered),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.locator('h1.page-heading')).toHaveText('Devices');
  const receivingScannerCard = page.locator('[data-testid="device-card"]', { hasText: 'Receiving scanner' });
  await expect(receivingScannerCard).toBeVisible();
  await expect(page.getByLabel('active: Online')).toBeVisible();
  await expect(receivingScannerCard.getByTestId('connection-status')).toContainText('Online since');

  const nameInput = page.getByLabel('Device name');
  const metadataInput = page.getByLabel('Metadata JSON');
  await nameInput.fill('Gateway 01');
  await expect(nameInput).toHaveValue('Gateway 01');
  await page.locator('select[formcontrolname="type"]').first().selectOption('gateway');
  await metadataInput.fill('{"zone":"dock"}');
  await expect(metadataInput).toHaveValue('{"zone":"dock"}');

  const registerButton = page.getByRole('button', { name: 'Register Device' });
  await expect(registerButton).toBeEnabled();
  await registerButton.click();

  await expect(page.getByLabel('One-time device API key')).toContainText('tnl_dev_e2e_key');
  await expect(page.getByLabel('One-time device API key')).toContainText('Scan the QR code');
  await expect(page.getByLabel('Device provisioning QR code').locator('img')).toBeVisible();
  await expect(page.locator('[data-testid="device-card"]', { hasText: 'Gateway 01' })).toBeVisible();
});

test('device registration QR provisioning panel stays within a narrow mobile viewport', async ({ page }) => {
  const devices: Device[] = [buildDevice()];

  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/devices/register')) {
      const registered = buildRegistration({
        name: 'Narrow gateway',
        type: 'gateway',
        online: false,
        lastSeenAt: null,
      });
      devices.unshift(registered);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(registered),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await page.getByLabel('Device name').fill('Narrow gateway');
  await page.locator('select[formcontrolname="type"]').first().selectOption('gateway');
  await page.getByLabel('Metadata JSON').fill('{"zone":"mobile"}');
  await page.getByRole('button', { name: 'Register Device' }).click();

  const panel = page.getByTestId('device-provisioning-panel');
  const qr = page.getByTestId('device-provisioning-qr');
  await expect(panel).toContainText('tnl_dev_e2e_key');
  await expect(qr.locator('img')).toBeVisible();
  await expect(page.getByTestId('device-provisioning-actions').getByRole('button')).toHaveCount(2);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);

  const qrBox = await qr.locator('img').boundingBox();
  expect(qrBox?.width ?? 0).toBeLessThanOrEqual(288);
});

test('device registry copies one-time API key and QR provisioning payload', async ({ page }) => {
  await page.addInitScript(() => {
    let clipboardText = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          clipboardText = value;
        },
        readText: async () => clipboardText,
      },
    });
  });
  const devices: Device[] = [buildDevice()];

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/devices/register')) {
      const registered = buildRegistration({
        name: 'Clipboard gateway',
        type: 'gateway',
        online: false,
        lastSeenAt: null,
      });
      devices.unshift(registered);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(registered),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.locator('[data-testid="device-card"]', { hasText: 'Receiving scanner' })).toBeVisible();

  const nameInput = page.getByLabel('Device name');
  const metadataInput = page.getByLabel('Metadata JSON');
  await nameInput.fill('Clipboard gateway');
  await expect(nameInput).toHaveValue('Clipboard gateway');
  await page.locator('select[formcontrolname="type"]').first().selectOption('gateway');
  await metadataInput.fill('{"zone":"copy"}');
  await expect(metadataInput).toHaveValue('{"zone":"copy"}');

  const registerButton = page.getByRole('button', { name: 'Register Device' });
  await expect(registerButton).toBeEnabled();
  await registerButton.click();

  await expect(page.getByLabel('One-time device API key')).toContainText('tnl_dev_e2e_key');

  await page.getByRole('button', { name: 'Copy Key' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('tnl_dev_e2e_key');

  await page.getByRole('button', { name: 'Copy QR Payload' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('tnl-device://provision?payload=e2e');
});

test('device fleet board exposes non-color visual states without horizontal overflow', async ({ page }) => {
  const devices: Device[] = [
    buildDevice({ name: 'Online scanner', status: 'active', online: true }),
    buildDevice({ name: 'Offline tablet', type: 'tablet', status: 'active', online: false, lastSeenAt: '2026-06-04T10:00:00.000Z' }),
    buildDevice({ name: 'Inactive sensor', type: 'sensor', status: 'inactive', online: false, heartbeatFailureCount: 2 }),
    buildDevice({ name: 'Suspended gateway', type: 'gateway', status: 'suspended', online: false, lastSeenAt: null }),
    buildDevice({ name: 'Revoked kiosk', type: 'kiosk', status: 'revoked', online: false, revokedAt: '2026-06-04T11:00:00.000Z' }),
  ];

  await page.route('**/api/v1/devices**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length }),
      });
      return;
    }

    await route.continue();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/devices');

  await expect(page.getByText('Online scanner')).toBeVisible();
  await expect(page.getByText('Offline tablet')).toBeVisible();
  await expect(page.getByText('Inactive sensor')).toBeVisible();
  await expect(page.getByText('Revoked kiosk')).toBeVisible();
  await expect(page.getByLabel('Device type: tablet')).toBeVisible();
  await expect(page.getByLabel('Device type: sensor')).toBeVisible();
  await expect(page.getByLabel('Device type: gateway')).toBeVisible();

  const onlineCard = page.locator('[data-testid="device-card"]', { hasText: 'Online scanner' });
  await expect(onlineCard.getByTestId('status-chip')).toContainText('Online');
  await expect(onlineCard.getByTestId('connection-status')).toContainText('Connected');
  await expect(onlineCard.getByLabel('active: Online')).toBeVisible();
  await expect(onlineCard.getByLabel(/Heartbeat: Connected/)).toBeVisible();

  const offlineCard = page.locator('[data-testid="device-card"]', { hasText: 'Offline tablet' });
  await expect(offlineCard.getByTestId('status-chip')).toContainText('Heartbeat missing');
  await expect(offlineCard.getByTestId('connection-status')).toContainText('Disconnected');
  await expect(offlineCard.getByLabel('active: Heartbeat missing')).toBeVisible();
  await expect(offlineCard.getByLabel(/Heartbeat: Disconnected/)).toBeVisible();

  const inactiveCard = page.locator('[data-testid="device-card"]', { hasText: 'Inactive sensor' });
  await expect(inactiveCard.getByLabel('inactive: Inactive')).toBeVisible();
  await expect(inactiveCard.getByLabel(/Heartbeat: Failed/)).toBeVisible();
  await expect(inactiveCard).toContainText('2 heartbeat failures');

  const suspendedCard = page.locator('[data-testid="device-card"]', { hasText: 'Suspended gateway' });
  await expect(suspendedCard.getByLabel('suspended: Access blocked')).toBeVisible();
  await expect(suspendedCard.getByLabel(/Heartbeat: Failed/)).toBeVisible();
  await expect(suspendedCard).toContainText('No heartbeat received');
  const revokedCard = page.locator('[data-testid="device-card"]', { hasText: 'Revoked kiosk' });
  await expect(revokedCard.getByLabel('revoked: Access revoked')).toBeVisible();
  await expect(revokedCard.locator('.device-card__actions select')).toBeDisabled();
  await expect(revokedCard.getByRole('button', { name: 'Revoke' })).toBeDisabled();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test('device registry uses shared visual primitives for loading, error, and empty states', async ({ page }) => {
  type RegistryState = 'empty' | 'loading' | 'error';
  let registryState: RegistryState = 'empty';
  let releaseLoading: (() => void) | undefined;
  let loadingReleased = Promise.resolve();

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      if (registryState === 'loading') {
        await loadingReleased;
      }

      if (registryState === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Device registry temporarily unavailable' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices: [], total: 0, page: 1, pageSize: 5 }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.getByTestId('empty-state')).toContainText('No devices registered');
  await expect(page.getByTestId('empty-state')).toContainText('Register the first scanner, tablet, gateway, or kiosk for this tenant.');

  loadingReleased = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });
  registryState = 'loading';
  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByTestId('device-loading-state')).toContainText('Device registry');
  await expect(page.getByTestId('device-loading-state')).toContainText('Connecting');
  await expect(page.getByTestId('device-loading-state')).toContainText('Loading device registry');

  releaseLoading?.();
  registryState = 'empty';
  await expect(page.getByTestId('empty-state')).toContainText('No devices registered');

  registryState = 'error';
  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByTestId('device-error-state')).toContainText('Device registry');
  await expect(page.getByTestId('device-error-state')).toContainText('Failed');
  await expect(page.getByTestId('device-error-state')).toContainText('Device registry unavailable');
  await expect(page.getByTestId('device-error-state')).toContainText('Device registry temporarily unavailable');
});

test('device registry filters by status, type, and search text', async ({ page }) => {
  const devices: Device[] = [
    buildDevice({ name: 'East scanner', type: 'scanner', status: 'active', online: true }),
    buildDevice({ name: 'West gateway', type: 'gateway', status: 'suspended', online: false, lastSeenAt: null }),
    buildDevice({ name: 'West tablet', type: 'tablet', status: 'suspended', online: false, lastSeenAt: null }),
    buildDevice({ name: 'North gateway', type: 'gateway', status: 'active', online: false, lastSeenAt: null }),
  ];
  let lastQuery = new URLSearchParams();

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET' || !url.pathname.endsWith('/api/v1/devices')) {
      await route.continue();
      return;
    }

    lastQuery = url.searchParams;
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const search = url.searchParams.get('search')?.toLowerCase();
    const filtered = devices.filter((device) =>
      (!status || device.status === status) &&
      (!type || device.type === type) &&
      (!search || device.name.toLowerCase().includes(search)),
    );

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ devices: filtered, total: filtered.length }),
    });
  });

  await page.goto('/devices');
  await expect(page.locator('[data-testid="device-card"]')).toHaveCount(4);

  await page.locator('.device-filters select[formcontrolname="status"]').selectOption('suspended');
  await page.locator('.device-filters select[formcontrolname="type"]').selectOption('gateway');
  await page.locator('.device-filters input[formcontrolname="search"]').fill('west');
  await page.locator('.device-filters button[type="submit"]').click();

  await expect(page.locator('[data-testid="device-card"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="device-card"]')).toContainText('West gateway');
  await expect(page.getByText('East scanner')).toBeHidden();
  expect(lastQuery.get('status')).toBe('suspended');
  expect(lastQuery.get('type')).toBe('gateway');
  expect(lastQuery.get('search')).toBe('west');
});

test('device registry paginates device cards', async ({ page }) => {
  const devices: Device[] = Array.from({ length: 7 }, (_, index) =>
    buildDevice({
      name: `Paged scanner ${index + 1}`,
      type: 'scanner',
      status: 'active',
      online: index < 2,
    }),
  );
  const seenQueries: URLSearchParams[] = [];

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET' || !url.pathname.endsWith('/api/v1/devices')) {
      await route.continue();
      return;
    }

    seenQueries.push(new URLSearchParams(url.searchParams));
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '5');
    const start = (pageNumber - 1) * pageSize;
    const paged = devices.slice(start, start + pageSize);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ devices: paged, total: devices.length, page: pageNumber, pageSize }),
    });
  });

  await page.goto('/devices');
  await expect(page.locator('[data-testid="device-card"]')).toHaveCount(5);
  await expect(page.getByTestId('device-pagination-summary')).toHaveText('Showing 1-5 of 7 devices');
  await expect(page.getByText('Paged scanner 1')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.locator('[data-testid="device-card"]')).toHaveCount(2);
  await expect(page.getByTestId('device-pagination-summary')).toHaveText('Showing 6-7 of 7 devices');
  await expect(page.getByText('Paged scanner 6')).toBeVisible();
  expect(seenQueries[seenQueries.length - 1].get('page')).toBe('2');
  expect(seenQueries[seenQueries.length - 1].get('pageSize')).toBe('5');

  await page.getByRole('button', { name: 'Previous' }).click();

  await expect(page.locator('[data-testid="device-card"]')).toHaveCount(5);
  await expect(page.getByTestId('device-pagination-summary')).toHaveText('Showing 1-5 of 7 devices');
  expect(seenQueries[seenQueries.length - 1].get('page')).toBe('1');
});

test('device registry updates and revokes device state from card controls', async ({ page }) => {
  const device = buildDevice({ name: 'Status scanner', status: 'active', online: true });
  const devices: Device[] = [device];
  let statusPayload: unknown;
  let revoked = false;

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length, page: 1, pageSize: 5 }),
      });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/devices/${device.id}/status`)) {
      statusPayload = request.postDataJSON();
      const updated = buildDevice({
        ...device,
        status: 'suspended',
        online: false,
        lastSeenAt: null,
      });
      devices.splice(0, 1, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    if (request.method() === 'DELETE' && url.pathname.endsWith(`/api/v1/devices/${device.id}`)) {
      revoked = true;
      const updated = buildDevice({
        ...devices[0],
        status: 'revoked',
        online: false,
        revokedAt: '2026-06-04T12:30:00.000Z',
      });
      devices.splice(0, 1, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');

  const card = page.locator('[data-testid="device-card"]', { hasText: 'Status scanner' });
  await expect(card).toBeVisible();

  await card.locator('.device-card__actions select').selectOption('suspended');

  await expect(card).toContainText('suspended');
  await expect(card).toContainText('No heartbeat received');
  expect(statusPayload).toEqual({
    status: 'suspended',
    reason: 'Changed from registry page to suspended',
  });

  await card.getByRole('button', { name: 'Revoke' }).click();

  await expect(card).toContainText('revoked');
  await expect(card).toContainText('Revoked');
  await expect(card.locator('.device-card__actions select')).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  expect(revoked).toBe(true);
});

test('device detail shows status, metadata, permissions, and audit events', async ({ page }) => {
  const device = buildDevice({
    name: 'Detail scanner',
    metadata: { zone: 'receiving', firmware: '1.2.3' },
    heartbeatFailureCount: 3,
    autoSuspendedAt: '2026-06-04T12:20:00.000Z',
  });
  const devices: Device[] = [device];
  const events: LedgerEventResponse[] = [
    buildLedgerEvent(device, 'DEVICE_REGISTERED', 1),
    buildLedgerEvent(device, 'DEVICE_HEARTBEAT', 2, {
      payload: { heartbeatStatus: 'online', metrics: { battery: 91, signal: 'strong' } },
    }),
    buildLedgerEvent(device, 'DEVICE_HEARTBEAT', 3, {
      payload: { heartbeatStatus: 'degraded', metrics: { battery: 43, signal: 'weak' } },
    }),
  ];
  let statusPayload: unknown;
  let revoked = false;

  await page.route('**/api/v1/ledger/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    });
  });

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/devices/${device.id}/status`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(devices[0]),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length, page: 1, pageSize: 5 }),
      });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/devices/${device.id}/status`)) {
      statusPayload = request.postDataJSON();
      const updated = buildDevice({
        ...devices[0],
        status: 'suspended',
        online: false,
        lastSeenAt: null,
      });
      devices.splice(0, 1, updated);
      events.push(buildLedgerEvent(updated, 'DEVICE_STATUS_CHANGED', 3));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    if (request.method() === 'DELETE' && url.pathname.endsWith(`/api/v1/devices/${device.id}`)) {
      revoked = true;
      const updated = buildDevice({
        ...devices[0],
        status: 'revoked',
        online: false,
        revokedAt: '2026-06-04T12:45:00.000Z',
      });
      devices.splice(0, 1, updated);
      events.push(buildLedgerEvent(updated, 'DEVICE_REVOKED', 4));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await page.getByRole('link', { name: 'Detail scanner' }).click();

  await expect(page).toHaveURL(new RegExp(`/devices/${device.id}$`));
  await expect(page.getByRole('heading', { name: 'Detail scanner' })).toBeVisible();
  await expect(page.getByTestId('device-detail')).toBeVisible();
  await expect(page.getByTestId('device-detail')).toContainText('device.heartbeat.write');
  await expect(page.getByTestId('device-detail')).toContainText('"zone": "receiving"');
  await expect(page.getByTestId('device-detail')).toContainText('Heartbeat failures');
  await expect(page.getByTestId('device-detail')).toContainText('3');
  await expect(page.getByTestId('device-detail')).toContainText('2026-06-04T12:20:00.000Z');
  await expect(page.getByTestId('device-heartbeat-history')).toContainText('battery: 91');
  await expect(page.getByTestId('device-heartbeat-history')).toContainText('degraded');
  await expect(page.getByTestId('device-event-stream')).toContainText('DEVICE_HEARTBEAT');

  devices.splice(0, 1, buildDevice({
    ...devices[0],
    status: 'inactive',
    online: false,
    lastSeenAt: null,
    heartbeatFailureCount: 1,
  }));

  await expect(page.getByTestId('device-detail')).toContainText('No heartbeat received', { timeout: 8_000 });
  await expect(page.getByTestId('device-detail')).toContainText('inactive');
  await expect(page.getByTestId('device-status-management')).toContainText('Revoke Device');
  await expect(page.getByText('Suspended and revoked devices cannot authenticate')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Change Detail scanner to suspended? Device-key access will be blocked.');
    await dialog.accept();
  });
  await page.locator('.detail-actions select').selectOption('suspended');

  await expect(page.getByTestId('device-detail')).toContainText('suspended');
  await expect(page.getByRole('region', { name: 'Status change audit trail' })).toContainText('DEVICE_STATUS_CHANGED');
  await expect(page.getByTestId('device-event-stream')).toContainText('DEVICE_STATUS_CHANGED');
  expect(statusPayload).toEqual({
    status: 'suspended',
    reason: 'Changed from detail page to suspended',
  });

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Revoke Detail scanner?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Revoke Device' }).click();

  await expect(page.getByTestId('device-detail')).toContainText('revoked');
  await expect(page.getByTestId('device-event-stream')).toContainText('DEVICE_REVOKED');
  await expect(page.locator('.detail-actions select')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Revoke Device' })).toBeDisabled();
  expect(revoked).toBe(true);
});

test('device audit trail shows registration, status, and revocation events in ledger events', async ({ page }) => {
  const devices: Device[] = [];
  const registered = buildRegistration({
    name: 'Audit gateway',
    type: 'gateway',
    online: false,
    lastSeenAt: null,
  });
  const events: LedgerEventResponse[] = [];

  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    });
  });

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length, page: 1, pageSize: 5 }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/devices/register')) {
      devices.unshift(registered);
      events.unshift(buildLedgerEvent(registered, 'DEVICE_REGISTERED', events.length + 1));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(registered),
      });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/devices/${registered.id}/status`)) {
      const updated = buildDevice({
        ...registered,
        status: 'suspended',
        online: false,
        lastSeenAt: null,
      });
      devices.splice(0, 1, updated);
      events.unshift(buildLedgerEvent(updated, 'DEVICE_STATUS_CHANGED', events.length + 1));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    if (request.method() === 'DELETE' && url.pathname.endsWith(`/api/v1/devices/${registered.id}`)) {
      const updated = buildDevice({
        ...devices[0],
        status: 'revoked',
        online: false,
        revokedAt: '2026-06-04T12:45:00.000Z',
      });
      devices.splice(0, 1, updated);
      events.unshift(buildLedgerEvent(updated, 'DEVICE_REVOKED', events.length + 1));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.getByText('No devices registered')).toBeVisible();

  await page.getByLabel('Device name').fill('Audit gateway');
  await page.locator('select[formcontrolname="type"]').first().selectOption('gateway');
  await page.getByRole('button', { name: 'Register Device' }).click();

  const card = page.locator('[data-testid="device-card"]', { hasText: 'Audit gateway' });
  await expect(card).toBeVisible();
  await expect(page.getByLabel('One-time device API key')).toContainText('tnl_dev_e2e_key');

  await card.locator('.device-card__actions select').selectOption('suspended');
  await expect(card).toContainText('suspended');

  await card.getByRole('button', { name: 'Revoke' }).click();
  await expect(card).toContainText('revoked');

  await page.goto('/ledger-events');
  await expect(page.locator('h1.page-heading')).toHaveText('Ledger Events');
  await expect(page.locator('[data-testid="ledger-events-list"]')).toBeVisible();
  await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText('DEVICE_REGISTERED');
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText('DEVICE_STATUS_CHANGED');
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText('DEVICE_REVOKED');
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText(`device / ${registered.id}`);
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText(`Actor: device / ${registered.id}`);
  await expect(page.locator('[data-testid="ledger-events-list"]')).toContainText('Result: accepted');
});

test('device event visibility starts with registration and shows ingested event in device detail', async ({ page }) => {
  const scannerEvent = DeviceHardwareExamples.scanner.event;
  const devices: Device[] = [];
  const registered = buildRegistration({
    name: 'Event scanner',
    type: 'scanner',
    online: true,
  });
  const events: LedgerEventResponse[] = [];
  let submittedEvent: unknown;
  let submittedDeviceKey: string | undefined;

  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    });
  });

  await page.route('**/api/v1/device-events', async (route) => {
    const request = route.request();

    if (request.method() === 'POST') {
      submittedEvent = request.postDataJSON();
      submittedDeviceKey = request.headers()['x-device-key'];
      events.push(buildLedgerEvent(registered, 'DEVICE_EVENT_RECEIVED', events.length + 1, {
        payload: {
          action: 'DEVICE_EVENT_RECEIVED',
          eventType: scannerEvent.eventType,
          ...scannerEvent.payload,
        },
      }));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          eventId: events[events.length - 1].id,
          serverTimestamp: new Date().toISOString(),
          nonce: 'event-visibility-nonce',
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/devices/${registered.id}/status`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(devices[0]),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length, page: 1, pageSize: 5 }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/devices/register')) {
      devices.unshift(registered);
      events.push(buildLedgerEvent(registered, 'DEVICE_REGISTERED', events.length + 1));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(registered),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.getByText('No devices registered')).toBeVisible();

  await page.getByLabel('Device name').fill('Event scanner');
  await page.locator('select[formcontrolname="type"]').first().selectOption('scanner');
  await page.getByRole('button', { name: 'Register Device' }).click();

  await expect(page.getByLabel('One-time device API key')).toContainText('tnl_dev_e2e_key');
  await expect(page.locator('[data-testid="device-card"]', { hasText: 'Event scanner' })).toBeVisible();

  const ingestionResponse = await page.evaluate(async (eventRequest) => {
    const response = await fetch('/api/v1/device-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': 'tnl_dev_e2e_key',
      },
      body: JSON.stringify(eventRequest),
    });

    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    };
  }, scannerEvent);

  expect(ingestionResponse.ok).toBe(true);
  expect(ingestionResponse.status).toBe(201);
  expect(submittedDeviceKey).toBe('tnl_dev_e2e_key');
  expect(submittedEvent).toEqual(scannerEvent);

  await page.getByRole('link', { name: 'Event scanner' }).click();

  await expect(page).toHaveURL(new RegExp(`/devices/${registered.id}$`));
  await expect(page.getByTestId('device-event-stream')).toContainText('DEVICE_EVENT_RECEIVED');
  await expect(page.getByTestId('device-event-stream')).toContainText(`Actor: device / ${registered.id}`);
  await expect(page.getByTestId('device-event-stream')).toContainText('Result: accepted');
});

test('device registry surfaces registration API errors', async ({ page }) => {
  const devices: Device[] = [buildDevice()];

  await page.route('**/api/v1/devices**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/devices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ devices, total: devices.length }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.includes('/api/v1/devices/register')) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: 'Device name is already registered',
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/devices');
  await expect(page.locator('[data-testid="device-card"]', { hasText: 'Receiving scanner' })).toBeVisible();

  const nameInput = page.getByLabel('Device name');
  const metadataInput = page.getByLabel('Metadata JSON');
  await nameInput.fill('Blocked device');
  await expect(nameInput).toHaveValue('Blocked device');
  await page.locator('select[formcontrolname="type"]').first().selectOption('scanner');
  await metadataInput.fill('{"blocked":true}');
  await expect(metadataInput).toHaveValue('{"blocked":true}');

  const registerButton = page.getByRole('button', { name: 'Register Device' });
  await expect(registerButton).toBeEnabled();
  await registerButton.click();

  await expect(page.getByTestId('device-error-state')).toContainText('Device name is already registered');
});
