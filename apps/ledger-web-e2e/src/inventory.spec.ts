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

function toast(page: Page) {
  return page.getByTestId('inventory-toast');
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
  await expect(page.getByTestId('inventory-dashboard')).toContainText('Inventory dashboard');
  await expect(page.getByTestId('dashboard-health')).toContainText('Low stock');
  await expect(page.getByTestId('dashboard-locations')).toContainText('Austin Warehouse - Aisle A1');
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
  await expect(toast(page)).toContainText('SKU-NEW added');
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

test('inventory page integrates shared empty-state and reduced-motion visual primitives', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/inventory**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 10 }),
    }),
  );

  await page.goto('/inventory');

  await expect(page.getByLabel('Inventory ledger')).toContainText('Verification pending');
  await expect(page.getByTestId('inventory-dashboard')).toContainText('No location inventory loaded');
  await expect(page.getByTestId('inventory-dashboard')).toContainText('No recent scans loaded');
  await expect(page.getByTestId('inventory-dashboard')).toContainText('No anomalies loaded');
  await expect(page.getByTestId('inventory-board').getByTestId('empty-state')).toContainText('No inventory found');

  const emptyStates = page.getByTestId('empty-state');
  await expect(emptyStates).toHaveCount(6);
  await expect(page.getByTestId('inventory-dashboard')).toHaveCSS('display', 'grid');
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test('inventory page imports CSV inventory with per-row results', async ({ page }) => {
  const imported = buildItem({
    sku: 'SKU-IMPORT-1',
    name: 'Imported sensor one',
    quantity: 6,
  });
  let importPayload: unknown;

  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/import')) {
      importPayload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { index: 0, sku: 'SKU-IMPORT-1', success: true, item: imported },
            { index: 1, sku: 'SKU-100', success: false, error: 'Inventory SKU SKU-100 already exists for tenant' },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [buildItem()], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const form = page.getByTestId('inventory-import-form');
  await form.locator('textarea[formcontrolname="payload"]').fill([
    'sku,name,locationId,locationName,quantity,unitOfMeasure',
    'sku-import-1,Imported sensor one,AUSTIN-A1,Austin Warehouse - Aisle A1,6,each',
    'sku-100,Duplicate sensor,AUSTIN-A1,Austin Warehouse - Aisle A1,4,each',
  ].join('\n'));
  await form.getByRole('button', { name: 'Submit import' }).click();

  await expect(page.getByTestId('inventory-success')).toContainText('1 of 2 inventory items imported.');
  const results = form.getByTestId('inventory-import-result');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText('SKU-IMPORT-1: Imported');
  await expect(results.nth(1)).toContainText('SKU-100: Rejected');
  expect(importPayload).toEqual({
    items: [
      expect.objectContaining({ sku: 'SKU-IMPORT-1', name: 'Imported sensor one', quantity: 6 }),
      expect.objectContaining({ sku: 'SKU-100', name: 'Duplicate sensor', quantity: 4 }),
    ],
  });
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
  await row.locator('.reservation-controls input[type="number"]').nth(0).fill('3');
  await row.getByTestId('reserve-inventory').click();
  await expect(row.getByTestId('reservation-summary')).toContainText('3 each reserved');
  await expect(row).toContainText('7 each');

  await row.getByTestId('release-inventory').click();
  await expect(row.getByTestId('reserve-inventory')).toBeVisible();
  await expect(row).toContainText('10 each');
});

test('inventory page reserves with timeout and releases expired reservations', async ({ page }) => {
  let item = buildItem({ quantity: 10 });
  let reservePayload: unknown;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.url().endsWith('/reserve')) {
      reservePayload = request.postDataJSON();
      item = {
        ...item,
        quantity: 7,
        reservedQuantity: 3,
        status: 'reserved',
        metadata: { reservationExpiresAt: '2026-06-11T11:00:00.000Z' },
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (request.method() === 'POST' && request.url().endsWith('/reservations/release-expired')) {
      item = { ...item, quantity: 10, reservedQuantity: 0, reservationOrderId: null, status: 'available', metadata: {} };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ released: [item], total: 1 }),
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
  const row = page.getByTestId('inventory-row');
  await row.locator('.reservation-controls input[type="number"]').nth(0).fill('3');
  await row.locator('.reservation-controls input[type="number"]').nth(1).fill('15');
  await row.getByTestId('reserve-inventory').click();
  await expect(row.getByTestId('reservation-summary')).toContainText('Expires 2026-06-11T11:00:00.000Z');
  expect(reservePayload).toEqual({ quantity: 3, timeoutMinutes: 15 });

  await page.getByTestId('release-expired-reservations').click();
  await expect(page.getByTestId('inventory-success')).toContainText('1 expired inventory reservations released.');
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

test('inventory page bulk moves newline-delimited item IDs and shows per-item results', async ({ page }) => {
  let first = buildItem({ quantity: 10 });
  const second = buildItem({ sku: 'SKU-BULK', name: 'Bulk move sensor', quantity: 9 });
  let bulkPayload: unknown;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/move/batch')) {
      bulkPayload = request.postDataJSON();
      const payload = bulkPayload as { locationId: string; locationName: string };
      first = { ...first, locationId: payload.locationId, locationName: payload.locationName };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { index: 0, itemId: first.id, success: true, item: first },
            { index: 1, itemId: second.id, success: false, error: `Inventory item ${second.id} not found` },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [first, second], total: 2, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const form = page.getByTestId('inventory-bulk-move-form');
  await form.locator('textarea[formcontrolname="itemIds"]').fill(`${first.id}\n${second.id}`);
  await form.locator('input[formcontrolname="locationId"]').fill('AUSTIN-C3');
  await form.locator('input[formcontrolname="locationName"]').fill('Austin Warehouse - Aisle C3');
  await form.locator('input[formcontrolname="reason"]').fill('Bulk aisle rebalance');
  await form.getByRole('button', { name: 'Submit bulk move' }).click();

  await expect(page.getByTestId('inventory-success')).toContainText('1 of 2 inventory items moved');
  const results = form.getByTestId('inventory-bulk-move-result');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText(`${first.id}: Moved`);
  await expect(results.nth(0)).toContainText('Austin Warehouse - Aisle C3');
  await expect(results.nth(1)).toContainText(`${second.id}: Rejected`);
  expect(bulkPayload).toEqual({
    itemIds: [first.id, second.id],
    locationId: 'AUSTIN-C3',
    locationName: 'Austin Warehouse - Aisle C3',
    reason: 'Bulk aisle rebalance',
  });
});

test('inventory page adjusts quantity and changes status with reasons', async ({ page }) => {
  let item = buildItem({ quantity: 10 });
  let quantityPayload: unknown;
  let statusPayload: unknown;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.url().endsWith('/quantity')) {
      quantityPayload = request.postDataJSON();
      const payload = quantityPayload as { quantity: number };
      item = { ...item, quantity: payload.quantity };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (request.method() === 'PATCH' && request.url().endsWith('/status')) {
      statusPayload = request.postDataJSON();
      const payload = statusPayload as { status: InventoryItem['status'] };
      item = { ...item, status: payload.status };
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
  const quantityControls = row.locator('.quantity-controls');
  await quantityControls.locator('input').nth(0).fill('8');
  await quantityControls.locator('input').nth(1).fill('Cycle count reconciliation');
  await row.getByTestId('adjust-inventory-quantity').click();
  await expect(page.getByTestId('inventory-success')).toContainText('quantity adjusted to 8 each');
  await expect(row).toContainText('8 each');
  expect(quantityPayload).toEqual({ quantity: 8, reason: 'Cycle count reconciliation' });

  const statusControls = row.locator('.status-controls');
  await statusControls.locator('select').selectOption('damaged');
  await statusControls.locator('input').fill('Quality hold');
  await row.getByTestId('change-inventory-status').click();
  await expect(page.getByTestId('inventory-success')).toContainText('status changed to damaged');
  await expect(row).toContainText('damaged');
  expect(statusPayload).toEqual({ status: 'damaged', reason: 'Quality hold' });
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

  await expect(page.getByTestId('inventory-success')).toContainText('scan accepted');
  await expect(scanForm.getByTestId('inventory-scan-feedback')).toHaveText('Scan accepted');
  await expect(scanForm.getByTestId('inventory-scan-feedback')).toHaveClass(/scan-feedback-accepted/);
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
  await expect(scanForm.getByTestId('inventory-scan-feedback')).toHaveText('Scan rejected');
  await expect(scanForm.getByTestId('inventory-scan-feedback')).toHaveClass(/scan-feedback-rejected/);
  await expect(scanForm.getByTestId('inventory-scan-feedback')).toHaveCSS('animation-name', 'none');
});

test('inventory page rejects a wrong-location scan with expected and scanned locations', async ({ page }) => {
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/scan')) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Inventory item SKU-LOW expected at AUSTIN-A1, not AUSTIN-B2' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [buildItem()], total: 1, page: 1, pageSize: 10 }),
    });
  });

  await page.goto('/inventory');
  const scanForm = page.getByTestId('inventory-scan-form');
  await scanForm.locator('input[formcontrolname="value"]').fill('SKU-LOW');
  await scanForm.locator('input[formcontrolname="locationId"]').fill('AUSTIN-B2');
  await scanForm.getByRole('button', { name: 'Submit scan' }).click();

  await expect(page.locator('body')).toContainText('expected at AUSTIN-A1, not AUSTIN-B2');
});

test('inventory page bulk scans newline-delimited values and shows per-item results', async ({ page }) => {
  const item = buildItem({ serialNumber: 'SERIAL-LOW-001' });
  let batchPayload: unknown;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/scan/batch')) {
      batchPayload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { index: 0, value: 'SERIAL-LOW-001', success: true, item: { ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' } },
            { index: 1, value: 'UNKNOWN', success: false, error: 'Inventory item UNKNOWN not found' },
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
  const form = page.getByTestId('inventory-batch-scan-form');
  await form.locator('textarea[formcontrolname="values"]').fill('SERIAL-LOW-001\nUNKNOWN');
  await form.locator('select[formcontrolname="scanType"]').selectOption('barcode');
  await form.locator('input[formcontrolname="locationId"]').fill('AUSTIN-A1');
  await form.getByRole('button', { name: 'Submit bulk scan' }).click();

  await expect(page.getByTestId('inventory-success')).toContainText('1 of 2 bulk inventory scans accepted');
  const results = form.getByTestId('inventory-batch-scan-result');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText('SERIAL-LOW-001: Accepted');
  await expect(results.nth(1)).toContainText('UNKNOWN: Rejected');
  expect(batchPayload).toEqual({
    scans: [
      { value: 'SERIAL-LOW-001', scanType: 'barcode', locationId: 'AUSTIN-A1' },
      { value: 'UNKNOWN', scanType: 'barcode', locationId: 'AUSTIN-A1' },
    ],
  });
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
            details: { action: 'INVENTORY_SCANNED', accepted: true, sourceEventType: 'inventory.scan' },
              timestamp: '2026-06-11T12:05:00.000Z',
              chainSequence: 2,
              eventHash: 'hash-scanned',
            },
          ],
          reservationHistory: [{
            eventId: randomUUID(),
            action: 'INVENTORY_RESERVED',
            actorType: 'user',
            actorId: 'inventory-admin',
            deviceId: null,
            deviceType: null,
            locationId: 'AUSTIN-A1',
            locationName: 'Austin Warehouse - Aisle A1',
            quantity: 2,
            reservedQuantity: 2,
            details: { action: 'INVENTORY_RESERVED', orderId: 'ORDER-1' },
            timestamp: '2026-06-11T12:03:00.000Z',
            chainSequence: 3,
            eventHash: 'hash-reserved',
          }],
          scanHistory: [{
            eventId: randomUUID(),
            action: 'INVENTORY_SCANNED',
            actorType: 'device',
            actorId: 'scanner-1',
            deviceId: 'scanner-1',
            deviceType: 'scanner',
            locationId: 'AUSTIN-B2',
            locationName: 'Austin Warehouse - Aisle B2',
            quantity: 4,
            reservedQuantity: 0,
            details: { action: 'INVENTORY_SCANNED', accepted: false, sourceEventType: 'inventory.scan' },
            timestamp: '2026-06-11T12:05:00.000Z',
            chainSequence: 2,
            eventHash: 'hash-scanned',
          }],
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
  const diagram = provenance.getByTestId('inventory-provenance-diagram');
  await expect(diagram).toContainText('Provenance diagram');
  await expect(diagram).toContainText('Accepted scan');
  await expect(diagram).toContainText('Rejected scan');
  await expect(diagram).toContainText('State: Anomaly');
  await expect(diagram).toContainText('Quantity: 4 each');
  const locationHistory = provenance.getByTestId('inventory-location-history-diagram');
  await expect(locationHistory).toContainText('Location history');
  await expect(locationHistory.getByTestId('inventory-location-history-entry')).toHaveCount(2);
  await expect(locationHistory).toContainText('Step 1');
  await expect(locationHistory).toContainText('Austin Warehouse - Aisle A1');
  await expect(locationHistory).toContainText('Step 2');
  await expect(locationHistory).toContainText('Austin Warehouse - Aisle B2');
  await expect(locationHistory).toContainText('State: Anomaly');
  await expect(provenance.getByTestId('inventory-reservation-history')).toContainText('INVENTORY_RESERVED');
  await expect(provenance.getByTestId('inventory-scan-history')).toContainText('Rejected scan');
  await expect(provenance.getByTestId('inventory-scan-history')).toContainText('Source event: inventory.scan');
  await expect(provenance.getByTestId('inventory-scan-history')).toContainText('Austin Warehouse - Aisle B2');
});

test('inventory page shows full item details and automatically loads provenance', async ({ page }) => {
  const item = buildItem({
    description: 'Serialized warehouse sensor',
    batchNumber: 'LOT-42',
    serialNumber: 'SERIAL-LOW-001',
    expirationDate: '2027-06-30',
    lastScannedAt: '2026-06-12T05:00:00.000Z',
  });
  let detailIncludedProvenance = false;
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/inventory/${item.id}/provenance`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item, events: [], reservationHistory: [], scanHistory: [] }),
      });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}`)) {
      detailIncludedProvenance = url.searchParams.get('includeProvenance') === 'true';
      const body = detailIncludedProvenance
        ? { item, events: [], reservationHistory: [], scanHistory: [] }
        : item;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
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
  await expect.poll(() => detailIncludedProvenance).toBe(true);

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

test('inventory detail view performs reservation, movement, and removal operations', async ({ page }) => {
  let item = buildItem({
    quantity: 10,
    description: 'Detail operations sensor',
    serialNumber: 'SERIAL-DETAIL-001',
  });
  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/inventory/${item.id}/provenance`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ item, events: [], reservationHistory: [], scanHistory: [] }) });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}/reserve`)) {
      const payload = request.postDataJSON();
      item = { ...item, quantity: item.quantity - payload.quantity, reservedQuantity: payload.quantity, status: 'reserved' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}/release`)) {
      item = { ...item, quantity: item.quantity + item.reservedQuantity, reservedQuantity: 0, reservationOrderId: null, status: 'available' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}/move`)) {
      const payload = request.postDataJSON();
      item = { ...item, locationId: payload.locationId, locationName: payload.locationName };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}`) && request.method() === 'DELETE') {
      const payload = request.postDataJSON();
      item = { ...item, quantity: 0, status: 'removed', removalReason: payload.reason, removedAt: '2026-06-12T04:10:00.000Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (url.pathname.endsWith(`/inventory/${item.id}`)) {
      const body = url.searchParams.get('includeProvenance') === 'true'
        ? { item, events: [], reservationHistory: [], scanHistory: [] }
        : item;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
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
  const actions = detail.getByTestId('inventory-detail-actions');
  await expect(actions).toContainText('Operations');

  await actions.locator('.reservation-controls input[type="number"]').nth(0).fill('3');
  await actions.getByTestId('detail-reserve-inventory').click();
  await expect(detail.getByTestId('detail-reservation-summary')).toContainText('3 each reserved');

  await actions.getByTestId('detail-release-inventory').click();
  await expect(actions.getByTestId('detail-reserve-inventory')).toBeVisible();

  const moveControls = actions.locator('.move-controls');
  await moveControls.locator('input').nth(0).fill('AUSTIN-C3');
  await moveControls.locator('input').nth(1).fill('Austin Warehouse - Aisle C3');
  await actions.getByTestId('detail-move-inventory').click();
  await expect(detail).toContainText('Austin Warehouse - Aisle C3');

  await actions.locator('.removal-controls input').fill('Obsolete inventory');
  await actions.getByTestId('detail-remove-inventory').click();
  await expect(detail.getByTestId('detail-removal-summary')).toContainText('Obsolete inventory');
  await expect(detail).toContainText('removed');
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
  const unexpectedMoveAnomaly = {
    ...anomaly,
    id: `${item.id}:unexpected_location`,
    type: 'unexpected_location',
    severity: 'error',
    message: `${item.sku} is recorded at AUSTIN-B2, expected AUSTIN-A1.`,
    locationId: 'AUSTIN-B2',
    locationName: 'Austin Warehouse - Aisle B2',
    remediation: 'Move inventory to the expected location or update the expected location metadata after verification.',
    details: {
      currentLocationId: 'AUSTIN-B2',
      expectedLocationId: 'AUSTIN-A1',
    },
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
      const anomalies = anomalyQuery.get('type') === 'unexpected_location' ? [unexpectedMoveAnomaly] : [anomaly];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ anomalies, total: anomalies.length }) });
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
  await card.getByTestId('resolve-anomaly').click();
  await expect(card).toContainText('Status: resolved');
  await expect(card.getByTestId('resolve-anomaly')).toBeDisabled();
  await expect(page.getByTestId('inventory-success')).toContainText('anomaly marked resolved');

  const anomalyPanel = page.getByTestId('inventory-anomalies');
  await anomalyPanel.locator('select[formcontrolname="type"]').selectOption('quantity_discrepancy');
  await anomalyPanel.locator('select[formcontrolname="severity"]').selectOption('warning');
  await anomalyPanel.locator('input[formcontrolname="detectedFrom"]').fill('2026-06-01');
  await anomalyPanel.locator('input[formcontrolname="detectedTo"]').fill('2026-06-30');
  await anomalyPanel.getByRole('button', { name: 'Apply anomaly filters' }).click();
  await expect.poll(() => anomalyQuery.get('type')).toBe('quantity_discrepancy');
  await expect.poll(() => anomalyQuery.get('severity')).toBe('warning');
  await expect.poll(() => anomalyQuery.get('detectedFrom')).toBe('2026-06-01');
  await expect.poll(() => anomalyQuery.get('detectedTo')).toBe('2026-06-30');

  await anomalyPanel.locator('select[formcontrolname="type"]').selectOption('unexpected_location');
  await anomalyPanel.locator('select[formcontrolname="severity"]').selectOption('error');
  await anomalyPanel.getByRole('button', { name: 'Apply anomaly filters' }).click();
  await expect.poll(() => anomalyQuery.get('type')).toBe('unexpected_location');
  await expect(page.getByTestId('inventory-anomaly-card')).toContainText('recorded at AUSTIN-B2');
  await expect(page.getByTestId('inventory-anomaly-card')).toContainText('Move inventory to the expected location');
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
  await expect(toast(page)).toContainText('1 inventory alerts generated and recorded.');
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

test('inventory dashboard exposes health, recent scan, and quick action state', async ({ page }) => {
  const item = buildItem({
    quantity: 2,
    expirationDate: '2026-07-01',
    lastScannedAt: '2026-06-12T05:00:00.000Z',
    metadata: { minimumQuantity: 5 },
  });
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
    remediation: 'Replenish inventory.',
    details: { quantity: 2, minimumQuantity: 5 },
  };
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

  await page.route('**/api/v1/inventory**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/inventory/anomalies/detect')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ anomalies: [anomaly], total: 1 }) });
      return;
    }
    if (url.pathname.endsWith('/inventory/alerts/generate')) {
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
  const dashboard = page.getByTestId('inventory-dashboard');
  await expect(dashboard.getByTestId('dashboard-health')).toContainText('Low stock');
  await expect(dashboard.getByTestId('dashboard-health')).toContainText('Expiring soon');
  await expect(dashboard.getByTestId('dashboard-recent-scans')).toContainText('SKU-LOW');

  await dashboard.getByTestId('dashboard-alerts').click();
  await expect(dashboard.getByTestId('dashboard-health')).toContainText('Active alerts');
  await dashboard.getByTestId('dashboard-anomalies').click();
  await expect(dashboard.getByTestId('dashboard-recent-anomalies')).toContainText('warning SKU-LOW | low_stock');
});
