import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import type { Order, OrderDetailResponse, OrderProof, OrderStatus, OrderTimelineEvent } from '@true-north-ledger/order-contracts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const now = '2026-06-05T12:00:00.000Z';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: randomUUID(),
    orderNumber: 'ORD-20260605-0001',
    tenantId,
    customerId: 'customer-100',
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    status: 'pending',
    items: [{ sku: 'SKU-100', name: 'Serialized sensor kit', quantity: 2, unitPrice: 49.5 }],
    totalAmount: 99,
    currency: 'USD',
    shippingAddress: { line1: '100 Warehouse Way', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
    billingAddress: null,
    metadata: {},
    correlationId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function buildTimeline(order: Order, statuses: OrderStatus[] = [order.status]): OrderTimelineEvent[] {
  return statuses.map((status, index) => ({
    eventId: randomUUID(),
    eventType: index === 0 ? 'ORDER_CREATED' : status === 'delivered' ? 'ORDER_DELIVERED' : 'ORDER_STATUS_CHANGED',
    orderId: order.id,
    orderNumber: order.orderNumber,
    correlationId: order.correlationId,
    actorMetadata: { customerId: order.customerId },
    previousStatus: index > 0 ? statuses[index - 1] : undefined,
    status,
    reason: index > 0 ? `Moved to ${status}` : undefined,
    actorType: 'user',
    actorId: 'admin',
    result: 'accepted',
    timestamp: new Date(Date.parse(now) + index * 1000).toISOString(),
  }));
}

function buildDetail(order: Order, statuses: OrderStatus[] = [order.status]): OrderDetailResponse {
  return {
    ...order,
    timeline: buildTimeline(order, statuses),
  };
}

function buildProof(order: Order, statuses: OrderStatus[] = [order.status]): OrderProof {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    correlationId: order.correlationId,
    generatedAt: now,
    generator: 'ledger-api',
    events: buildTimeline(order, statuses),
    proofHash: 'proof-hash-123',
  };
}

async function seedOrderSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
    window.localStorage.setItem('tnl.authToken', 'orders-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '11111111-1111-4111-8111-111111111111',
        permissions: ['orders.read', 'orders.write', 'orders.status.write', 'proof.read'],
      }),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await seedOrderSession(page);
});

test('order OpenAPI document exposes examples, transition rules, and error responses', async ({ request }) => {
  const response = await request.get('/api/docs-json');
  expect(response.ok()).toBe(true);

  const document = await response.json();
  const create = document.paths['/api/v1/orders'].post;
  const status = document.paths['/api/v1/orders/{id}/status'].patch;

  expect(create.requestBody.content['application/json'].schema.example.customerId).toBe('customer-100');
  expect(create.responses).toEqual(expect.objectContaining({ '201': expect.any(Object), '400': expect.any(Object), '403': expect.any(Object), '429': expect.any(Object) }));
  expect(status.description).toContain('pending -> confirmed -> processing -> shipped -> delivered');
  expect(status.responses).toEqual(expect.objectContaining({ '400': expect.any(Object), '403': expect.any(Object), '404': expect.any(Object), '409': expect.any(Object) }));
});

test('orders page receives tenant-scoped real-time order creation updates', async ({ page, request }) => {
  const loginResponse = await request.post('/api/v1/auth/login', {
    data: { username: 'admin', password: 'admin' },
  });
  expect(loginResponse.ok()).toBe(true);
  const session = await loginResponse.json();

  await page.goto('/login');
  await page.evaluate((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, session);
  await page.goto('/orders');
  await expect(page.getByTestId('order-realtime-state')).toContainText('connected');

  const customerId = `realtime-${randomUUID()}`;
  await page.locator('.order-filters input[formcontrolname="customerId"]').fill(customerId);
  await page.locator('.order-filters button[type="submit"]').click();
  await expect(page.locator('[data-testid="order-card"]')).toHaveCount(0);

  const createResponse = await request.post('/api/v1/orders', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: {
      customerId,
      customerName: 'Real-time E2E Customer',
      currency: 'USD',
      items: [{ sku: 'RT-100', name: 'Real-time item', quantity: 1, unitPrice: 10 }],
      shippingAddress: {
        line1: '100 Realtime Way',
        city: 'Austin',
        region: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      idempotencyKey: customerId,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();

  await expect(page.locator('[data-testid="order-card"]', { hasText: created.orderNumber })).toBeVisible();
});

test('orders page lists, filters, and creates an order from server responses', async ({ page }) => {
  const orders = [
    buildOrder({ orderNumber: 'ORD-20260605-0001', customerName: 'Northwind Receiving', status: 'pending' }),
    buildOrder({ orderNumber: 'ORD-20260605-0002', customerName: 'Southwind Fulfillment', status: 'delivered', deliveredAt: now }),
  ];
  let lastQuery = new URLSearchParams();

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      lastQuery = url.searchParams;
      const status = url.searchParams.get('status');
      const query = url.searchParams.get('query')?.toLowerCase();
      const sortBy = url.searchParams.get('sortBy');
      const sortDirection = url.searchParams.get('sortDirection');
      const filtered = orders.filter(
        (order) =>
          (!status || order.status === status) &&
          (!query || order.orderNumber.toLowerCase().includes(query) || order.customerName.toLowerCase().includes(query)),
      );
      const sorted = [...filtered].sort((left, right) => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        if (sortBy === 'totalAmount') {
          return (left.totalAmount - right.totalAmount) * direction;
        }
        return left.createdAt.localeCompare(right.createdAt) * direction;
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: sorted, total: sorted.length, page: 1, pageSize: 5 }) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.includes('/api/v1/orders/')) {
      const id = url.pathname.split('/').at(-1);
      const order = orders.find((item) => item.id === id) ?? orders[0];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDetail(order)) });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/orders')) {
      const created = buildOrder({ orderNumber: 'ORD-20260605-0003', customerName: request.postDataJSON().customerName });
      orders.unshift(created);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    await route.continue();
  });

  await page.goto('/orders');
  await expect(page.locator('h1.page-heading')).toHaveText('Orders');
  await expect(page.getByTestId('orders-nav-badge')).toHaveText('2');
  await expect(page.locator('[data-testid="order-card"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="order-card"]', { hasText: 'ORD-20260605-0001' }).getByTestId('order-status-icon')).toHaveAttribute('aria-label', 'Order status: pending');
  await expect(page.locator('[data-testid="order-card"]', { hasText: 'ORD-20260605-0002' }).getByTestId('order-status-icon')).toHaveAttribute('aria-label', 'Order status: delivered');

  await page.locator('.order-filters select[formcontrolname="status"]').selectOption('pending');
  await page.locator('.order-filters input[formcontrolname="query"]').fill('north');
  await page.getByLabel('Created from').fill('2026-06-01');
  await page.getByLabel('Created to').fill('2026-06-05');
  await page.getByLabel('Sort by').selectOption('totalAmount');
  await page.getByLabel('Direction').selectOption('asc');
  await page.locator('.order-filters button[type="submit"]').click();

  await expect(page.locator('[data-testid="order-card"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="order-card"]')).toContainText('Northwind Receiving');
  expect(lastQuery.get('status')).toBe('pending');
  expect(lastQuery.get('query')).toBe('north');
  expect(lastQuery.get('createdFrom')).toContain('2026-06-01');
  expect(lastQuery.get('createdTo')).toContain('2026-06-06');
  expect(lastQuery.get('sortBy')).toBe('totalAmount');
  expect(lastQuery.get('sortDirection')).toBe('asc');

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('[data-testid="order-card"]')).toHaveCount(2);
  await expect(page.locator('.order-filters select[formcontrolname="status"]')).toHaveValue('');
  await expect(page.locator('.order-filters input[formcontrolname="query"]')).toHaveValue('');
  await expect(page.locator('.order-filters input[formcontrolname="createdFrom"]')).toHaveValue('');
  await expect(page.locator('.order-filters input[formcontrolname="createdTo"]')).toHaveValue('');
  expect(lastQuery.get('status')).toBeNull();
  expect(lastQuery.get('query')).toBeNull();
  expect(lastQuery.get('sortBy')).toBe('createdAt');
  expect(lastQuery.get('sortDirection')).toBe('desc');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await csvDownload).suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.getByRole('button', { name: 'Next step' }).click();
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('order-create-review-step')).toBeVisible();
  await page.getByRole('button', { name: 'Create Order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  await page.goto('/orders');
  await expect(page.locator('[data-testid="order-card"]', { hasText: 'ORD-20260605-0003' })).toBeVisible();
});

test('order creation steps validate fields, add and remove items, and submit all remaining items', async ({ page }) => {
  const orders: Order[] = [];
  let submittedItems: { sku: string; name: string; unitPrice: number }[] = [];

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders, total: orders.length, page: 1, pageSize: 5 }) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.includes('/api/v1/orders/')) {
      const id = url.pathname.split('/').at(-1);
      const order = orders.find((item) => item.id === id) ?? orders[0];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDetail(order)) });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/api/v1/orders')) {
      const body = request.postDataJSON() as { customerName: string; items: { sku: string }[] };
      submittedItems = body.items;
      const created = buildOrder({ orderNumber: 'ORD-20260605-0100', customerName: body.customerName });
      orders.unshift(created);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    await route.continue();
  });

  await page.goto('/orders');
  await expect(page.getByTestId('order-create')).toBeVisible();
  await page.getByLabel('Customer name').fill('');
  await page.getByRole('button', { name: 'Next step' }).click();

  await expect(page.getByTestId('order-error-state')).toContainText('Complete the customer step before continuing.');

  await page.getByLabel('Customer name').fill('Recovered Customer');
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('order-create-items-step')).toBeVisible();

  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByTestId('order-create-item')).toHaveCount(2);
  await page.getByTestId('order-create-item').nth(1).getByLabel('SKU').fill('SKU-COLD');
  await expect(page.getByTestId('order-create-item').nth(1).getByLabel('Item name')).toHaveValue('Cold-chain monitor');
  await expect(page.getByTestId('order-create-item').nth(1).getByLabel('Unit price')).toHaveValue('72');
  await expect(page.getByTestId('order-create-item').nth(1).getByTestId('order-item-catalog').locator('option')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove item 1' }).click();
  await expect(page.getByTestId('order-create-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('order-create-shipping-step')).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('order-create-review-step')).toContainText('1 item(s)');
  await page.getByLabel('Metadata JSON').fill('{invalid');
  await page.getByRole('button', { name: 'Create Order' }).click();
  await expect(page.getByTestId('order-create').getByTestId('order-error-state')).toContainText('Metadata must be valid JSON.');
  await page.getByLabel('Metadata JSON').fill('{"source":"e2e"}');
  await page.getByRole('button', { name: 'Create Order' }).click();

  await expect(page).toHaveURL(/\/orders\/.+/);
  expect(submittedItems).toEqual([expect.objectContaining({ sku: 'SKU-COLD', name: 'Cold-chain monitor', unitPrice: 72 })]);
  await expect(page.getByRole('heading', { name: 'ORD-20260605-0100' })).toBeVisible();
});

test('order detail advances status, cancels, and shows timeline updates', async ({ page }) => {
  let order = buildOrder({ status: 'pending' });
  let statuses: OrderStatus[] = ['pending'];
  await page.addInitScript(() => {
    window.print = () => window.localStorage.setItem('tnl.printedOrder', 'true');
  });

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [order], total: 1, page: 1, pageSize: 1 }) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/orders/${order.id}`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDetail(order, statuses)) });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/orders/${order.id}/status`)) {
      const body = request.postDataJSON() as { status: OrderStatus };
      order = { ...order, status: body.status, confirmedAt: body.status === 'confirmed' ? now : order.confirmedAt };
      statuses = [...statuses, body.status];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order) });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith(`/api/v1/orders/${order.id}/cancel`)) {
      order = { ...order, status: 'cancelled', cancelledAt: now };
      statuses = [...statuses, 'cancelled'];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order) });
      return;
    }

    await route.continue();
  });

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole('heading', { name: order.orderNumber })).toBeVisible();
  await expect(page.getByTestId('order-timeline')).toContainText('ORDER_CREATED');

  await page.getByRole('button', { name: 'Print Order' }).click();
  await expect(page.getByTestId('order-print-message')).toHaveText('Print dialog opened');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('tnl.printedOrder'))).toBe('true');

  await page.getByRole('button', { name: 'Mark confirmed' }).click();
  await expect(page.getByTestId('order-detail')).toContainText('confirmed');
  await expect(page.getByTestId('order-timeline')).toContainText('Moved to confirmed');

  await page.getByRole('button', { name: 'Cancel Order' }).click();
  await expect(page.getByTestId('order-detail')).toContainText('cancelled');
  await expect(page.getByTestId('order-timeline')).toContainText('ORDER_STATUS_CHANGED');
});

test('order detail completes the full lifecycle and shows every status in the timeline', async ({ page }) => {
  let order = buildOrder({ status: 'pending' });
  let statuses: OrderStatus[] = ['pending'];
  const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
    pending: 'confirmed',
    confirmed: 'processing',
    processing: 'shipped',
    shipped: 'delivered',
  };

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [order], total: 1, page: 1, pageSize: 1 }) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/orders/${order.id}`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDetail(order, statuses)) });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/orders/${order.id}/status`)) {
      const body = request.postDataJSON() as { status: OrderStatus };
      order = {
        ...order,
        status: body.status,
        confirmedAt: body.status === 'confirmed' ? now : order.confirmedAt,
        shippedAt: body.status === 'shipped' ? now : order.shippedAt,
        deliveredAt: body.status === 'delivered' ? now : order.deliveredAt,
      };
      statuses = [...statuses, body.status];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order) });
      return;
    }

    await route.continue();
  });

  await page.goto(`/orders/${order.id}`);

  while (nextStatus[order.status]) {
    const target = nextStatus[order.status] as OrderStatus;
    await page.getByRole('button', { name: `Mark ${target}` }).click();
    await expect(page.getByTestId('order-detail')).toContainText(target);
  }

  await expect(page.getByTestId('order-detail')).toContainText('delivered');
  await expect(page.getByTestId('order-detail').getByTestId('order-status-icon')).toHaveAttribute('aria-label', 'Order status: delivered');
  await expect(page.getByRole('button', { name: 'Lifecycle complete' })).toBeDisabled();
  await expect(page.getByTestId('order-timeline')).toContainText('ORDER_CREATED');
  for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) {
    await expect(page.getByTestId('order-timeline')).toContainText(`Moved to ${status}`);
  }
  await expect(page.getByTestId('order-timeline')).toContainText('ORDER_DELIVERED');
  await expect(page.getByTestId('order-timeline-connector')).toHaveCount(statuses.length - 1);
  await expect(page.getByTestId('order-timeline-summary').locator('.tnl-timeline-rail__entry')).toHaveCount(statuses.length);
  await expect(page.getByTestId('order-timeline-summary').locator('.tnl-timeline-rail__entry--current')).toContainText('ORDER_DELIVERED');
  await expect(page.getByTestId('order-timeline').locator('.tnl-ledger-event-card')).toHaveCount(statuses.length);

  const deliveredEvent = page.getByTestId('order-timeline-event').filter({ hasText: 'ORDER_DELIVERED' }).first();
  await deliveredEvent.getByRole('button', { name: 'Show details' }).click();
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText(order.correlationId);
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText(order.customerId);
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText('shipped');
  await deliveredEvent.getByRole('button', { name: 'Hide details' }).click();
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toHaveCount(0);
});

test('order detail generates and verifies proof without horizontal overflow on mobile', async ({ page }) => {
  const order = buildOrder({ status: 'delivered', deliveredAt: now });
  const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
  const proof = buildProof(order, statuses);
  let verificationAttempt = 0;

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [order], total: 1, page: 1, pageSize: 1 }) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/orders/${order.id}`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDetail(order, statuses)) });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/orders/${order.id}/proof`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(proof) });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/v1/proofs/verify', async (route) => {
    verificationAttempt += 1;
    const verification = verificationAttempt === 1
      ? { valid: false, proofHash: proof.proofHash, verifiedAt: now, reason: 'Proof mismatch' }
      : { valid: true, proofHash: proof.proofHash, verifiedAt: now };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(verification) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/orders/${order.id}`);

  const deliveredEvent = page.getByTestId('order-timeline-event').filter({ hasText: 'ORDER_DELIVERED' }).first();
  await deliveredEvent.getByRole('button', { name: 'Show details' }).click();
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText(order.correlationId);

  await expect(page.locator('tnl-order-proof')).toBeVisible();
  await page.getByRole('button', { name: 'Generate Proof' }).click();
  await expect(page.getByTestId('order-proof-panel')).toContainText('proof-hash-123');
  await expect(page.getByTestId('proof-json')).toContainText('ORDER_DELIVERED');
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--pending')).toContainText('Pending');

  const proofDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Proof' }).click();
  expect((await proofDownload).suggestedFilename()).toBe(`${order.orderNumber}-proof.json`);
  await expect(page.getByTestId('proof-action-message')).toHaveText('Proof downloaded');

  await page.getByRole('button', { name: 'Verify Proof' }).click();
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--failed')).toContainText('Failed');
  await expect(page.getByTestId('proof-verification-result')).toHaveText('Proof mismatch');

  await page.getByRole('button', { name: 'Verify Proof' }).click();
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--verified')).toContainText('Verified');
  await expect(page.getByTestId('proof-verification-result')).toHaveText('Proof verified');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
