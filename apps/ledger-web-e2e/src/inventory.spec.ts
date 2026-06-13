import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import type { InventoryItem } from '@true-north-ledger/inventory-contracts';

const now = '2026-06-11T12:00:00.000Z';
const tenantId = '11111111-1111-4111-8111-111111111111';

function buildItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: randomUUID(),
    tenantId,
    sku: 'SKU-LOW',
    name: 'Low stock sensor',
    description: '',
    locationId: 'AUSTIN-A1',
    locationName: 'Austin Warehouse - Aisle A1',
    quantity: 4,
    reservedQuantity: 0,
    reservationOrderId: null,
    unitOfMeasure: 'each',
    status: 'available',
    batchNumber: null,
    serialNumber: null,
    expirationDate: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    lastScannedAt: null,
    removalReason: null,
    removedAt: null,
    ...overrides,
  };
}

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
    window.localStorage.setItem('tnl.authToken', 'inventory-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '11111111-1111-4111-8111-111111111111',
        permissions: ['inventory.read', 'inventory.write'],
      }),
    );
  });
}

test.beforeEach(async ({ page }) => seedSession(page));

test('inventory page lists, filters, and adds tenant inventory', async ({ page }) => {
  const items = [buildItem()];
  let lastQuery = new URLSearchParams();

  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      const created = buildItem({
        sku: payload.sku,
        name: payload.name,
        locationId: payload.locationId,
        locationName: payload.locationName,
        quantity: payload.quantity,
        unitOfMeasure: payload.unitOfMeasure,
      });
      items.unshift(created);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    lastQuery = url.searchParams;
    const query = url.searchParams.get('query')?.toLowerCase();
    const filtered = items.filter((item) => !query || item.sku.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: filtered, total: filtered.length, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.getByTestId('inventory-row')).toContainText('SKU-LOW');
  await expect(page.getByTestId('low-stock-label')).toHaveText('Low stock');

  await page.locator('.inventory-filters input[formcontrolname="query"]').fill('sensor');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => lastQuery.get('query')).toBe('sensor');

  const addForm = page.getByTestId('inventory-add-form');
  await addForm.locator('input[formcontrolname="sku"]').fill('SKU-NEW');
  await addForm.locator('input[formcontrolname="name"]').fill('New sensor inventory item');
  await addForm.locator('input[formcontrolname="locationId"]').fill('AUSTIN-B2');
  await addForm.locator('input[formcontrolname="locationName"]').fill('Austin Warehouse - Aisle B2');
  await addForm.locator('input[formcontrolname="quantity"]').fill('12');
  await addForm.getByRole('button', { name: 'Add inventory' }).click();

  await expect(page.getByTestId('inventory-success')).toContainText('SKU-NEW added');
  await expect(page.getByTestId('inventory-row').filter({ hasText: 'SKU-NEW' })).toBeVisible();
});

test('inventory page remains readable without horizontal viewport overflow on mobile', async ({ page }) => {
  await page.route('**/api/v1/inventory**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [buildItem()], total: 1, page: 1, pageSize: 10 }),
    }),
  );
  await page.goto('/inventory');
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test('inventory page reserves and releases available stock', async ({ page }) => {
  let item = buildItem({ quantity: 10 });
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.url().endsWith('/reserve')) {
      const payload = request.postDataJSON();
      item = { ...item, quantity: item.quantity - payload.quantity, reservedQuantity: payload.quantity, status: 'reserved' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (request.method() === 'PATCH' && request.url().endsWith('/release')) {
      item = { ...item, quantity: item.quantity + item.reservedQuantity, reservedQuantity: 0, reservationOrderId: null, status: 'available' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const row = page.getByTestId('inventory-row');
  await row.locator('input[type="number"]').fill('3');
  await row.getByTestId('reserve-inventory').click();
  await expect(row.getByTestId('reservation-summary')).toContainText('3 each reserved');
  await expect(row).toContainText('7 each');

  await row.getByTestId('release-inventory').click();
  await expect(row.getByTestId('reserve-inventory')).toBeVisible();
  await expect(row).toContainText('10 each');
});

test('inventory page moves stock to a new location', async ({ page }) => {
  let item = buildItem({ quantity: 10 });
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.url().endsWith('/move')) {
      const payload = request.postDataJSON();
      item = { ...item, locationId: payload.locationId, locationName: payload.locationName };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const row = page.getByTestId('inventory-row');
  const moveControls = row.locator('.move-controls');
  await moveControls.locator('input').nth(0).fill('AUSTIN-B2');
  await moveControls.locator('input').nth(1).fill('Austin Warehouse - Aisle B2');
  await row.getByTestId('move-inventory').click();

  await expect(page.getByTestId('inventory-success')).toContainText('moved to Austin Warehouse - Aisle B2');
  await expect(row).toContainText('Austin Warehouse - Aisle B2');
  await expect(row).toContainText('(AUSTIN-B2)');
});

test('inventory page soft-removes stock with a required reason', async ({ page }) => {
  let item = buildItem({ quantity: 10 });
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      const payload = request.postDataJSON();
      item = {
        ...item,
        quantity: 0,
        status: 'removed',
        removalReason: payload.reason,
        removedAt: '2026-06-12T04:10:00.000Z',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const row = page.getByTestId('inventory-row');
  await row.locator('.removal-controls input').fill('Damaged beyond repair');
  await row.getByTestId('remove-inventory').click();

  await expect(page.getByTestId('inventory-success')).toContainText('removed from active inventory');
  await expect(row.getByTestId('removal-summary')).toContainText('Damaged beyond repair');
  await expect(row).toContainText('removed');
  await expect(row).toContainText('0 each');
  await expect(row.getByTestId('move-inventory')).toHaveCount(0);
});

test('inventory page submits a scan and shows accessible accepted feedback', async ({ page }) => {
  let item = buildItem({ serialNumber: 'SERIAL-LOW-001' });
  let scanPayload: unknown;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/scan')) {
      scanPayload = request.postDataJSON();
      item = { ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const scanForm = page.getByTestId('inventory-scan-form');
  await scanForm.locator('input[formcontrolname="value"]').fill('SERIAL-LOW-001');
  await scanForm.locator('select[formcontrolname="scanType"]').selectOption('barcode');
  await scanForm.locator('input[formcontrolname="locationId"]').fill('AUSTIN-A1');
  await scanForm.getByRole('button', { name: 'Submit scan' }).click();

  await expect(page.getByRole('status')).toContainText('scan accepted');
  expect(scanPayload).toEqual({ value: 'SERIAL-LOW-001', scanType: 'barcode', locationId: 'AUSTIN-A1' });
});

test('inventory page shows rejected scan feedback without relying on motion', async ({ page }) => {
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/scan')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Inventory item UNKNOWN not found' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [buildItem()], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/inventory');
  const scanForm = page.getByTestId('inventory-scan-form');
  const scanValue = scanForm.locator('input[formcontrolname="value"]');
  await scanValue.pressSequentially('UNKNOWN');
  await expect(scanValue).toHaveValue(/\S+/);
  await scanForm.getByRole('button', { name: 'Submit scan' }).click();

  await expect(page.locator('body')).toContainText('Inventory item UNKNOWN not found');
});

test('inventory page renders the complete provenance chain with actor and location labels', async ({ page }) => {
  const item = buildItem();
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && request.url().endsWith(`/inventory/${item.id}/provenance`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          item,
          events: [
            {
              eventId: randomUUID(),
              action: 'INVENTORY_ADDED',
              actorType: 'user',
              actorId: 'inventory-admin',
              deviceId: null,
              deviceType: null,
              locationId: 'AUSTIN-A1',
              locationName: 'Austin Warehouse - Aisle A1',
              quantity: 4,
              reservedQuantity: 0,
              details: { action: 'INVENTORY_ADDED' },
              timestamp: now,
              chainSequence: 1,
              eventHash: 'hash-added',
            },
            {
              eventId: randomUUID(),
              action: 'INVENTORY_SCANNED',
              actorType: 'device',
              actorId: 'scanner-1',
              deviceId: 'scanner-1',
              deviceType: 'scanner',
              locationId: 'AUSTIN-A1',
              locationName: 'Austin Warehouse - Aisle A1',
              quantity: 4,
              reservedQuantity: 0,
              details: { action: 'INVENTORY_SCANNED' },
              timestamp: '2026-06-11T12:05:00.000Z',
              chainSequence: 2,
              eventHash: 'hash-scanned',
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  await page.getByTestId('view-provenance').click();

  const provenance = page.getByTestId('inventory-provenance');
  await expect(provenance).toContainText('Inventory chain of custody');
  await expect(provenance.getByTestId('inventory-provenance-event')).toHaveCount(2);
  await expect(provenance).toContainText('INVENTORY_ADDED');
  await expect(provenance).toContainText('INVENTORY_SCANNED');
  await expect(provenance).toContainText('device / scanner-1');
  await expect(provenance).toContainText('Austin Warehouse - Aisle A1');
  await expect(provenance).toContainText('Chain #2');
});

test('inventory page shows full item details and automatically loads provenance', async ({ page }) => {
  const item = buildItem({
    description: 'Serialized warehouse sensor',
    batchNumber: 'LOT-42',
    serialNumber: 'SERIAL-LOW-001',
    expirationDate: '2027-06-30',
    lastScannedAt: '2026-06-12T05:00:00.000Z',
  });
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/inventory/${item.id}/provenance`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item, events: [] }),
      });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  await page.getByTestId('view-inventory-detail').click();

  const detail = page.getByTestId('inventory-detail');
  await expect(detail).toContainText('Serialized warehouse sensor');
  await expect(detail).toContainText('LOT-42');
  await expect(detail).toContainText('SERIAL-LOW-001');
  await expect(detail).toContainText('2027-06-30');
  await expect(page.getByTestId('inventory-provenance')).toContainText('Inventory chain of custody');

  await detail.getByTestId('close-inventory-detail').click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByTestId('inventory-provenance')).toHaveCount(0);
});

test('inventory anomaly cards show severity, status, remediation, and filtering consistently', async ({ page }) => {
  const item = buildItem({ quantity: 2 });
  const anomaly = {
    id: `${item.id}:low_stock`,
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    type: 'low_stock',
    severity: 'warning',
    status: 'open',
    message: `${item.sku} has 2 each available; minimum is 5.`,
    locationId: item.locationId,
    locationName: item.locationName,
    detectedAt: now,
    remediation: 'Replenish inventory or adjust the minimum quantity threshold.',
    details: { quantity: 2, minimumQuantity: 5 },
  };
  let anomalyQuery = new URLSearchParams();
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/inventory/anomalies/detect')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ anomalies: [anomaly], total: 1 }) });
      return;
    }
    if (url.pathname.endsWith('/inventory/anomalies')) {
      anomalyQuery = url.searchParams;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ anomalies: [anomaly], total: 1 }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  await page.getByTestId('detect-anomalies').click();
  const card = page.getByTestId('inventory-anomaly-card');
  await expect(card).toContainText('Warning');
  await expect(card).toContainText('Status: open');
  await expect(card.getByTestId('anomaly-remediation')).toContainText('Replenish inventory');

  const anomalyPanel = page.getByTestId('inventory-anomalies');
  await anomalyPanel.locator('select[formcontrolname="type"]').selectOption('low_stock');
  await anomalyPanel.locator('select[formcontrolname="severity"]').selectOption('warning');
  await anomalyPanel.getByRole('button', { name: 'Apply anomaly filters' }).click();
  await expect.poll(() => anomalyQuery.get('type')).toBe('low_stock');
  await expect.poll(() => anomalyQuery.get('severity')).toBe('warning');
});

test('inventory alerts show actionable severity labels and support filtering', async ({ page }) => {
  const item = buildItem({ quantity: 2 });
  const alert = {
    id: `${item.id}:low_stock:low_stock`,
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    type: 'low_stock',
    severity: 'warning',
    message: `${item.sku} has 2 each available; minimum is 5.`,
    locationId: item.locationId,
    locationName: item.locationName,
    createdAt: now,
    action: 'Replenish inventory.',
    details: { quantity: 2, minimumQuantity: 5 },
  };
  let alertQuery = new URLSearchParams();
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/inventory/alerts/generate')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [alert], total: 1 }) });
      return;
    }
    if (url.pathname.endsWith('/inventory/alerts')) {
      alertQuery = url.searchParams;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [alert], total: 1 }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  await page.getByTestId('generate-alerts').click();
  const card = page.getByTestId('inventory-alert-card');
  await expect(card).toContainText('Warning');
  await expect(card).toContainText('low_stock');
  await expect(card.getByTestId('alert-action')).toContainText('Replenish inventory');

  const alertPanel = page.getByTestId('inventory-alerts');
  await alertPanel.locator('select[formcontrolname="type"]').selectOption('low_stock');
  await alertPanel.locator('select[formcontrolname="severity"]').selectOption('warning');
  await alertPanel.getByRole('button', { name: 'Apply alert filters' }).click();
  await expect.poll(() => alertQuery.get('type')).toBe('low_stock');
  await expect.poll(() => alertQuery.get('severity')).toBe('warning');
});
