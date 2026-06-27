import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { io, type Socket } from 'socket.io-client';
import type { Order, OrderDetailResponse, OrderProof, OrderStatus, OrderTimelineEvent } from '@true-north-ledger/order-contracts';
import { AppNotificationSchema } from '@true-north-ledger/shared-models';

const tenantId = '11111111-1111-4111-8111-111111111111';
const now = '2026-06-05T12:00:00.000Z';
const socketBaseUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
let cachedAdminSession: {
  accessToken: string;
  refreshToken: string;
  user: { tenantId: string };
} | null = null;

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
  await page.addInitScript((apiUrl) => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
    window.localStorage.setItem('tnl.socketBaseUrl', apiUrl);
    if (!window.localStorage.getItem('tnl.authToken')) {
      window.localStorage.setItem('tnl.authToken', 'orders-token');
    }
    if (!window.localStorage.getItem('tnl.authUser')) {
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
    }
  }, socketBaseUrl);
}

function orderUiUser(user: { tenantId: string } & Record<string, unknown>): Record<string, unknown> {
  return {
    ...user,
    permissions: [
      'ledger.read',
      'orders.read',
      'orders.write',
      'orders.status.write',
      'proof.read',
      'devices.read',
      'inventory.read',
    ],
  };
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
  const session = await loginAsAdmin(request);

  await page.goto('/login');
  await page.evaluate((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, { ...session, user: orderUiUser(session.user) });
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

test('orders page applies real-time order status updates to the visible list', async ({ page, request }) => {
  const session = await loginAsAdmin(request);

  await page.goto('/login');
  await page.evaluate((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, { ...session, user: orderUiUser(session.user) });
  await page.goto('/orders');
  await expect(page.getByTestId('order-realtime-state')).toContainText('connected');

  const customerId = `status-realtime-${randomUUID()}`;
  await page.locator('.order-filters input[formcontrolname="customerId"]').fill(customerId);
  await page.locator('.order-filters button[type="submit"]').click();
  await expect(page.locator('[data-testid="order-card"]')).toHaveCount(0);

  const createResponse = await request.post('/api/v1/orders', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: {
      customerId,
      customerName: 'Status Realtime E2E Customer',
      currency: 'USD',
      items: [{ sku: 'RT-STATUS-100', name: 'Status realtime item', quantity: 1, unitPrice: 12 }],
      shippingAddress: {
        line1: '200 Realtime Way',
        city: 'Austin',
        region: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      idempotencyKey: customerId,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as Order;

  await page.locator('.order-filters button[type="submit"]').click();
  const orderCard = page.locator('[data-testid="order-card"]', { hasText: created.orderNumber });

  await expect(orderCard).toBeVisible();
  await expect(orderCard.getByTestId('order-status-icon')).toHaveAttribute('aria-label', 'Order status: pending');

  const statusResponse = await request.patch(`/api/v1/orders/${created.id}/status`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: {
      status: 'confirmed',
      reason: 'Realtime list status update e2e',
    },
  });
  expect(statusResponse.status()).toBe(200);

  await expect(orderCard.getByTestId('order-status-icon')).toHaveAttribute('aria-label', 'Order status: confirmed');
  await expect(orderCard.getByTestId('status-chip')).toContainText('confirmed');
});

test('order realtime socket reports ping and connection status', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const socket = await connectOrderSocket(baseURL, session.accessToken);

  try {
    const pong = await emitWithAck<{ event: string; timestamp: string }>(
      socket,
      'ping',
    );
    expect(pong).toEqual({
      event: 'pong',
      timestamp: expect.any(String),
    });

    await expect.poll(
      async () => emitWithAck<{
        connected: boolean;
        namespace: string;
        subscriptions: string[];
        activeConnections: number;
        heartbeatIntervalMs: number;
      }>(socket, 'get_status'),
      { timeout: 5_000 },
    ).toMatchObject({ connected: true });

    const status = await emitWithAck<{
      connected: boolean;
      namespace: string;
      subscriptions: string[];
      activeConnections: number;
      heartbeatIntervalMs: number;
    }>(socket, 'get_status');

    expect(status.connected).toBe(true);
    expect(status.namespace).toBe('/orders');
    expect(status.subscriptions).toContain(tenantRoom(session.user.tenantId));
    expect(status.activeConnections).toBeGreaterThanOrEqual(1);
    expect(status.heartbeatIntervalMs).toBe(30_000);
  } finally {
    socket.disconnect();
  }
});

test('notification socket delivers subscribed ledger events after durable writes', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const socket = await connectNotificationSocket(baseURL, session.accessToken);
  const subjectId = `sprint-5-${randomUUID()}`;

  try {
    const pong = await emitWithAck<{ type: string; timestamp: string }>(
      socket,
      'heartbeat.ping',
    );
    expect(pong).toEqual({
      type: 'heartbeat.pong',
      timestamp: expect.any(String),
    });

    const subscribed = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
    }>(socket, 'subscribe', {
      subjectType: 'order',
      subjectId,
    });
    expect(subscribed.subscribed).toBe(true);
    expect(subscribed.rooms).toContain(
      `tenant:${session.user.tenantId}:subject:order:${subjectId}`,
    );

    const status = await emitWithAck<{
      connected: boolean;
      namespace: string;
      subscriptions: string[];
      activeConnections: number;
      heartbeatIntervalMs: number;
    }>(socket, 'get_status');
    expect(status).toMatchObject({
      connected: true,
      namespace: '/ws',
      subscriptions: [
        `tenant:${session.user.tenantId}:subject:order:${subjectId}`,
      ],
      heartbeatIntervalMs: 30_000,
    });
    expect(status.activeConnections).toBeGreaterThanOrEqual(1);

    const notification = waitForNotification(socket, subjectId);
    const createResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId,
        payload: { action: 'SPRINT_5_NOTIFICATION_E2E' },
      },
    });
    expect(createResponse.status()).toBe(201);

    const receivedNotification = AppNotificationSchema.parse(await notification);
    expect(receivedNotification).toMatchObject({
      event: 'LEDGER_EVENT_CREATED',
      category: 'ledger',
      priority: 'high',
      ledgerEvent: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId,
        metadata: { tenantId: session.user.tenantId },
      },
    });
  } finally {
    socket.disconnect();
  }
});

test('notification socket rejects missing and invalid authentication', async ({ baseURL }) => {
  await expect(expectNotificationSocketRejected(baseURL)).resolves.toBeUndefined();
  await expect(
    expectNotificationSocketRejected(baseURL, 'invalid-notification-token'),
  ).resolves.toBeUndefined();
});

test('notification socket accepts bearer authorization header authentication', async ({
  request,
  baseURL,
}) => {
  const session = await loginAsAdmin(request);
  const socket = await connectNotificationSocketWithBearerHeader(
    baseURL,
    session.accessToken,
  );

  try {
    const status = await emitWithAck<{
      connected: boolean;
      namespace: string;
      tenantId: string;
      subscriptions: string[];
      activeConnections: number;
    }>(socket, 'get_status');

    expect(status).toMatchObject({
      connected: true,
      namespace: '/ws',
      tenantId: session.user.tenantId,
      subscriptions: [],
    });
    expect(status.activeConnections).toBeGreaterThanOrEqual(1);
  } finally {
    socket.disconnect();
  }
});

test('notification socket rate limits excessive subscription attempts', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const socket = await connectNotificationSocket(baseURL, session.accessToken);

  try {
    for (let index = 0; index < 10; index += 1) {
      const subscribed = await emitWithAck<{
        subscribed: boolean;
        rooms: string[];
      }>(socket, 'subscribe', {
        subjectType: 'order',
        subjectId: `rate-limit-${index}`,
      });

      expect(subscribed.subscribed).toBe(true);
      expect(subscribed.rooms).toEqual([
        `tenant:${session.user.tenantId}:subject:order:rate-limit-${index}`,
      ]);
    }

    const rateLimited = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
      code: string;
      error: string;
      retryAfterMs: number;
    }>(socket, 'subscribe', {
      subjectType: 'order',
      subjectId: 'rate-limit-over',
    });

    expect(rateLimited).toMatchObject({
      subscribed: false,
      rooms: [],
      code: 'NOTIFICATION_RATE_LIMITED',
      error: 'Notification subscription rate limit exceeded',
    });
    expect(rateLimited.retryAfterMs).toBeGreaterThan(0);
  } finally {
    socket.disconnect();
  }
});

test('notification socket filters subscribed ledger events by subject', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const socket = await connectNotificationSocket(baseURL, session.accessToken);
  const subjectId = `filtered-${randomUUID()}`;
  const otherSubjectId = `filtered-other-${randomUUID()}`;
  const received: unknown[] = [];

  socket.on('notification.created', (notification: unknown) => {
    received.push(notification);
  });

  try {
    const subscribed = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
    }>(socket, 'subscribe', {
      subjectType: 'order',
      subjectId,
    });
    expect(subscribed.subscribed).toBe(true);
    expect(subscribed.rooms).toEqual([
      `tenant:${session.user.tenantId}:subject:order:${subjectId}`,
    ]);

    const nonMatchingResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId: otherSubjectId,
        payload: { action: 'SPRINT_5_FILTER_NON_MATCH' },
      },
    });
    expect(nonMatchingResponse.status()).toBe(201);
    await pageWait(250);
    expect(received).toHaveLength(0);

    const notification = waitForNotification(socket, subjectId);
    const matchingResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId,
        payload: { action: 'SPRINT_5_FILTER_MATCH' },
      },
    });
    expect(matchingResponse.status()).toBe(201);

    await expect(notification).resolves.toMatchObject({
      event: 'LEDGER_EVENT_CREATED',
      ledgerEvent: {
        subjectType: 'order',
        subjectId,
        metadata: { tenantId: session.user.tenantId },
      },
    });
    expect(
      received.some(
        (notification) =>
          (notification as { ledgerEvent?: { subjectId?: string } }).ledgerEvent
            ?.subjectId === otherSubjectId,
      ),
    ).toBe(false);
  } finally {
    socket.disconnect();
  }
});

test('notification socket broadcasts matching ledger events to multiple subscribed clients', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const firstSocket = await connectNotificationSocket(baseURL, session.accessToken);
  const secondSocket = await connectNotificationSocket(baseURL, session.accessToken);
  const subjectId = `broadcast-${randomUUID()}`;

  try {
    const firstSubscribed = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
    }>(firstSocket, 'subscribe', {
      subjectType: 'order',
      subjectId,
    });
    const secondSubscribed = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
    }>(secondSocket, 'subscribe', {
      subjectType: 'order',
      subjectId,
    });
    const expectedRoom = `tenant:${session.user.tenantId}:subject:order:${subjectId}`;
    expect(firstSubscribed).toMatchObject({
      subscribed: true,
      rooms: [expectedRoom],
    });
    expect(secondSubscribed).toMatchObject({
      subscribed: true,
      rooms: [expectedRoom],
    });

    const firstStatus = await emitWithAck<{
      connected: boolean;
      activeConnections: number;
    }>(firstSocket, 'get_status');
    expect(firstStatus.connected).toBe(true);
    expect(firstStatus.activeConnections).toBeGreaterThanOrEqual(2);

    const firstNotification = waitForNotification(firstSocket, subjectId);
    const secondNotification = waitForNotification(secondSocket, subjectId);
    const createResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId,
        payload: { action: 'SPRINT_5_BROADCAST_E2E' },
      },
    });
    expect(createResponse.status()).toBe(201);

    const received = await Promise.all([firstNotification, secondNotification]);
    for (const notification of received) {
      expect(AppNotificationSchema.parse(notification)).toMatchObject({
        event: 'LEDGER_EVENT_CREATED',
        ledgerEvent: {
          subjectType: 'order',
          subjectId,
          metadata: { tenantId: session.user.tenantId },
        },
      });
    }
  } finally {
    firstSocket.disconnect();
    secondSocket.disconnect();
  }
});

test('notification socket reconnects after transport interruption', async ({ request, baseURL }) => {
  const session = await loginAsAdmin(request);
  const socket = await connectNotificationSocket(baseURL, session.accessToken);
  const subjectId = `reconnect-${randomUUID()}`;

  try {
    const reconnected = waitForSocketReconnect(socket);
    (socket.io.engine as { close: () => void }).close();
    await reconnected;
    expect(socket.connected).toBe(true);

    const subscribed = await emitWithAck<{
      subscribed: boolean;
      rooms: string[];
    }>(socket, 'subscribe', {
      subjectType: 'order',
      subjectId,
    });
    expect(subscribed).toMatchObject({
      subscribed: true,
      rooms: [`tenant:${session.user.tenantId}:subject:order:${subjectId}`],
    });

    const notification = waitForNotification(socket, subjectId);
    const createResponse = await request.post('/api/v1/ledger/events', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: {
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId,
        payload: { action: 'SPRINT_5_RECONNECT_E2E' },
      },
    });
    expect(createResponse.status()).toBe(201);

    await expect(notification).resolves.toMatchObject({
      event: 'LEDGER_EVENT_CREATED',
      ledgerEvent: {
        subjectType: 'order',
        subjectId,
        metadata: { tenantId: session.user.tenantId },
      },
    });
  } finally {
    socket.disconnect();
  }
});

test('dashboard live operations board renders subscribed ledger notifications', async ({ page, request }) => {
  const session = await loginAsAdmin(request);
  const subjectId = `dashboard-live-${randomUUID()}`;

  await page.addInitScript((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, { ...session, user: orderUiUser(session.user) });
  await page.goto('/dashboard');

  const liveBoard = page.getByTestId('live-operations-board');
  await expect(liveBoard).toContainText('Live operations');
  await expect(liveBoard.getByTestId('connection-status')).toContainText('Connected');
  await expect(page.getByTestId('readiness-score')).toContainText('70 readiness points');
  await expect(page.getByTestId('live-event-count')).toContainText(
    '0 live ledger events received this session.',
  );
  const createResponse = await request.post('/api/v1/ledger/events', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: {
      type: 'LEDGER_EVENT',
      subjectType: 'order',
      subjectId,
      payload: { action: 'DASHBOARD_LIVE_OPERATIONS_E2E' },
    },
  });
  expect(createResponse.status()).toBe(201);

  await expect(page.getByTestId('live-event-feed')).toContainText(subjectId);
  await expect(page.getByTestId('live-event-count')).toContainText(
    '1 live ledger event received this session.',
  );
  await expect(page.getByTestId('readiness-score')).toContainText('100 readiness points');
  await expect(page.getByTestId('notification-badge')).toHaveText('1');
  await expect(page.getByTestId('notification-toast')).toContainText(subjectId);
  await expect(page.getByTestId('notification-toast')).toHaveAttribute('data-tone', 'error');
  const toastLayout = await page.getByTestId('notification-toast').evaluate((toast) => {
    const box = toast.getBoundingClientRect();
    return {
      bottomOffset: Math.round(window.innerHeight - box.bottom),
      widthRatio: box.width / document.documentElement.clientWidth,
    };
  });
  expect(toastLayout.bottomOffset).toBeGreaterThanOrEqual(12);
  expect(toastLayout.bottomOffset).toBeLessThanOrEqual(32);
  expect(toastLayout.widthRatio).toBeGreaterThan(0.72);
  expect(toastLayout.widthRatio).toBeLessThan(0.78);

  await page.getByTestId('notification-trigger').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toContainText('DASHBOARD_LIVE_OPERATIONS_E2E');
  await expect(panel).toContainText(`order / ${subjectId}`);
  await expect(panel.getByTestId('notification-severity-icon')).toHaveText('priority_high');
  await panel.getByRole('button', { name: 'Mark read' }).first().click();
  await expect(page.getByTestId('notification-badge')).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Clear all' })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId('notification-panel')).toHaveCount(0);
});

test('dashboard live operations board stays within mobile viewport', async ({ page, request }) => {
  const session = await loginAsAdmin(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, { ...session, user: orderUiUser(session.user) });

  await page.goto('/dashboard');

  const liveBoard = page.getByTestId('live-operations-board');
  await expect(liveBoard).toBeVisible();
  await expect(liveBoard.getByTestId('connection-status')).toContainText(
    /Connected|Connecting/,
  );

  const layout = await liveBoard.evaluate((board) => {
    const boardBox = board.getBoundingClientRect();
    const status = board.querySelector('[data-testid="connection-status"]');
    const score = board.querySelector('[data-testid="readiness-score"]');
    const statusBox = status?.getBoundingClientRect();
    const scoreBox = score?.getBoundingClientRect();

    return {
      documentOverflows:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      boardFits:
        boardBox.left >= 0 &&
        boardBox.right <= document.documentElement.clientWidth + 1,
      statusFits:
        Boolean(statusBox) &&
        statusBox.left >= boardBox.left &&
        statusBox.right <= boardBox.right + 1,
      scoreFits:
        Boolean(scoreBox) &&
        scoreBox.left >= boardBox.left &&
        scoreBox.right <= boardBox.right + 1,
    };
  });

  expect(layout).toEqual({
    documentOverflows: false,
    boardFits: true,
    statusFits: true,
    scoreFits: true,
  });
});

test('dashboard live event feed updates in reduced-motion mode', async ({ page, request }) => {
  const subjectId = `dashboard-reduced-motion-${randomUUID()}`;

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.locator('input[formcontrolname="username"]').fill('admin');
  await page.locator('input[formcontrolname="password"]').fill('admin');
  await page.locator('input[formcontrolname="rememberMe"]').check();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  const liveBoard = page.getByTestId('live-operations-board');
  await expect(liveBoard).toBeVisible();
  await expect(liveBoard).toContainText('Subscribed to tenant ledger events', {
    timeout: 10_000,
  });

  const accessToken = await page.evaluate(() =>
    window.localStorage.getItem('tnl.authToken'),
  );
  expect(accessToken).toBeTruthy();

  const createResponse = await request.post('/api/v1/ledger/events', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      type: 'LEDGER_EVENT',
      subjectType: 'order',
      subjectId,
      payload: { action: 'DASHBOARD_REDUCED_MOTION_E2E' },
    },
  });
  expect(createResponse.status()).toBe(201);

  await expect(page.getByTestId('live-event-feed')).toContainText(subjectId, {
    timeout: 15_000,
  });

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('ledger events page prepends live notification events', async ({ page, request }) => {
  const session = await loginAsAdmin(request);
  const subjectId = `ledger-events-live-${randomUUID()}`;
  await page.addInitScript((authSession) => {
    window.localStorage.setItem('tnl.authToken', authSession.accessToken);
    window.localStorage.setItem('tnl.refreshToken', authSession.refreshToken);
    window.localStorage.setItem('tnl.authUser', JSON.stringify(authSession.user));
  }, { ...session, user: orderUiUser(session.user) });

  await page.goto('/ledger-events');
  await expect(page.locator('h1')).toHaveText('Ledger Events');
  await expect(page.getByTestId('ledger-events-live-status')).toContainText(
    'Live ledger events are prepended as they arrive.',
  );
  await pageWait(500);

  const createResponse = await request.post('/api/v1/ledger/events', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: {
      type: 'LEDGER_EVENT',
      subjectType: 'order',
      subjectId,
      payload: { action: 'LEDGER_EVENTS_LIVE_E2E' },
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { id: string };

  const firstRow = page.getByTestId('ledger-event-row').first();
  await expect(firstRow).toContainText('LEDGER_EVENTS_LIVE_E2E');
  await expect(firstRow).toContainText(`order / ${subjectId}`);
  await expect(firstRow).toHaveAttribute('data-event-id', created.id);
  await expect(firstRow).toHaveAttribute('data-live-event', 'true');
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

async function loginAsAdmin(request: APIRequestContext): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { tenantId: string };
}> {
  if (cachedAdminSession) {
    return cachedAdminSession;
  }

  let lastStatus = 0;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await request.post(`${apiBaseUrl()}/api/v1/auth/login`, {
      data: { username: 'admin', password: 'admin' },
    });
    lastStatus = response.status();
    if (response.ok()) {
      cachedAdminSession = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        user: { tenantId: string };
      };
      return cachedAdminSession;
    }
    if (lastStatus !== 429) {
      break;
    }
    await pageWait(2_000 * (attempt + 1));
  }

  throw new Error(`Admin login failed with status ${lastStatus}`);
}

function apiBaseUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function connectOrderSocket(
  _baseURL: string | undefined,
  accessToken: string,
): Promise<Socket> {
  const socket = io(`${apiBaseUrl()}/orders`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    timeout: 5_000,
  });

  return new Promise((resolve, reject) => {
    socket.on('heartbeat.ping', (_payload, acknowledge?: (response: { event: string; timestamp: string }) => void) => {
      acknowledge?.({ event: 'heartbeat.pong', timestamp: new Date().toISOString() });
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function connectNotificationSocket(
  _baseURL: string | undefined,
  accessToken: string,
): Promise<Socket> {
  const socket = io(`${apiBaseUrl()}/ws`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    timeout: 5_000,
  });

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function connectNotificationSocketWithBearerHeader(
  _baseURL: string | undefined,
  accessToken: string,
): Promise<Socket> {
  const socket = io(`${apiBaseUrl()}/ws`, {
    extraHeaders: { Authorization: `Bearer ${accessToken}` },
    transports: ['websocket'],
    timeout: 5_000,
  });

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function expectNotificationSocketRejected(
  _baseURL: string | undefined,
  accessToken?: string,
): Promise<void> {
  const socket = io(`${apiBaseUrl()}/ws`, {
    auth: accessToken ? { token: accessToken } : {},
    transports: ['websocket'],
    timeout: 5_000,
    reconnection: false,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for notification socket rejection'));
    }, 5_000);
    const finish = () => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    };

    socket.once('connect_error', finish);
    socket.once('disconnect', finish);
  });
}

function emitWithAck<TResponse>(
  socket: Socket,
  eventName: 'ping' | 'heartbeat.ping' | 'get_status',
): Promise<TResponse>;

function emitWithAck<TResponse>(
  socket: Socket,
  eventName: 'subscribe',
  payload: unknown,
): Promise<TResponse>;

function emitWithAck<TResponse>(
  socket: Socket,
  eventName: 'ping' | 'heartbeat.ping' | 'get_status' | 'subscribe',
  payload?: unknown,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${eventName} ack`)),
      5_000,
    );
    const finish = (response: TResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };
    if (eventName === 'subscribe') {
      socket.emit(eventName, payload, finish);
      return;
    }
    socket.emit(eventName, finish);
  });
}

function waitForNotification(socket: Socket, subjectId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for notification ${subjectId}`)),
      5_000,
    );
    socket.on('notification.created', (notification: unknown) => {
      const subject = (
        notification as { ledgerEvent?: { subjectId?: string } }
      ).ledgerEvent?.subjectId;
      if (subject === subjectId) {
        clearTimeout(timeout);
        resolve(notification);
      }
    });
  });
}

function waitForSocketReconnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for socket reconnect')),
      5_000,
    );
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function pageWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tenantRoom(roomTenantId: string): string {
  return `tenant:${roomTenantId}`;
}

test('orders list surfaces failed network state and stays within mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/orders**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Orders API unavailable' }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/orders');

  await expect(page.getByTestId('order-error-state')).toContainText('Orders API unavailable');
  await expect(page.getByTestId('order-error-state')).toContainText('Failed');
  await expect(page.getByTestId('empty-state')).toContainText('No orders found');
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
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
  const secondItem = page.getByTestId('order-create-item').nth(1);
  await expect(secondItem.getByTestId('order-item-catalog').locator('option')).toHaveCount(3);
  const skuInput = secondItem.getByLabel('SKU');
  await skuInput.click();
  await skuInput.pressSequentially('SKU-COLD');
  await expect(skuInput).toHaveValue('SKU-COLD');
  await expect(secondItem.getByLabel('Item name')).toHaveValue('Cold-chain monitor');
  await expect(secondItem.getByLabel('Unit price')).toHaveValue('72');
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

test('order detail surfaces invalid transition errors without changing status', async ({ page }) => {
  const order = buildOrder({ status: 'confirmed' });

  await page.route('**/api/v1/orders**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [order], total: 1, page: 1, pageSize: 1 }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith(`/api/v1/orders/${order.id}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDetail(order, ['pending', 'confirmed'])),
      });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith(`/api/v1/orders/${order.id}/status`)) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid transition from confirmed to shipped' }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole('heading', { name: order.orderNumber })).toBeVisible();
  await expect(page.getByTestId('order-detail')).toContainText('confirmed');

  await page.getByRole('button', { name: 'Mark processing' }).click();

  await expect(page.getByTestId('order-detail-error')).toContainText('Invalid transition from confirmed to shipped');
  await expect(page.getByTestId('order-detail').getByTestId('status-chip').filter({ hasText: 'confirmed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark processing' })).toBeEnabled();
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
  await expect(page.getByTestId('order-timeline-summary').getByTestId('timeline-rail')).toHaveAccessibleName(`Order ledger milestones: ${statuses.length} entries`);
  await expect(page.getByTestId('order-timeline-summary').getByTestId('timeline-rail-entry')).toHaveCount(statuses.length);
  await expect(page.getByTestId('order-timeline-summary').getByTestId('timeline-rail-entry').filter({ hasText: 'ORDER_DELIVERED' })).toContainText('Current');
  await expect(page.getByTestId('order-timeline').getByTestId('ledger-event-card')).toHaveCount(statuses.length);

  const deliveredEvent = page.getByTestId('order-timeline-event').filter({ hasText: 'ORDER_DELIVERED' }).first();
  await deliveredEvent.getByRole('button', { name: 'Show details' }).click();
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText(order.correlationId);
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText(order.customerId);
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toContainText('shipped');
  await deliveredEvent.getByRole('button', { name: 'Hide details' }).click();
  await expect(deliveredEvent.getByTestId('order-timeline-details')).toHaveCount(0);
});

test('order detail lifecycle rail wraps labels without mobile overflow', async ({ page }) => {
  const order = buildOrder({ status: 'processing' });
  const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing'];

  await page.setViewportSize({ width: 320, height: 720 });
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

    await route.continue();
  });

  await page.goto(`/orders/${order.id}`);

  const detail = page.getByTestId('order-detail');
  const lifecycleRail = detail.getByTestId('progress-rail').first();
  const lifecycleSteps = lifecycleRail.getByTestId('progress-rail-step');
  await expect(lifecycleRail).toHaveAccessibleName('Order lifecycle: 2 of 5 complete');
  await expect(lifecycleSteps).toHaveCount(5);
  await expect(lifecycleSteps.nth(0)).toContainText('pending');
  await expect(lifecycleSteps.nth(0)).toContainText('Complete');
  await expect(lifecycleSteps.nth(1)).toContainText('confirmed');
  await expect(lifecycleSteps.nth(1)).toContainText('Complete');
  await expect(lifecycleSteps.nth(2)).toContainText('processing');
  await expect(lifecycleSteps.nth(2)).toContainText('Current');
  await expect(lifecycleSteps.nth(3)).toContainText('shipped');
  await expect(lifecycleSteps.nth(3)).toContainText('Pending');
  await expect(lifecycleSteps.nth(4)).toContainText('delivered');
  await expect(lifecycleSteps.nth(4)).toContainText('Pending');
  await expect(page.getByTestId('order-timeline-summary').getByTestId('timeline-rail-entry')).toHaveCount(statuses.length);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);

  const stepsStayInsideRail = await lifecycleRail.evaluate((rail) => {
    const railBox = rail.getBoundingClientRect();
    return Array.from(rail.querySelectorAll('.tnl-progress-rail__step')).every((step) => {
      const stepBox = step.getBoundingClientRect();
      return stepBox.left >= railBox.left && stepBox.right <= railBox.right + 1;
    });
  });
  expect(stepsStayInsideRail).toBe(true);
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
  await expect(page.getByTestId('proof-state-strip')).toContainText('Proof unavailable until a server proof is generated.');
  await page.getByRole('button', { name: 'Generate Proof' }).click();
  await expect(page.getByTestId('order-proof-panel')).toContainText('proof-hash-123');
  await expect(page.getByTestId('proof-state-strip')).toContainText('Proof generated and waiting for verification.');
  await expect(page.getByTestId('proof-metadata')).toContainText(order.correlationId);
  await expect(page.getByTestId('proof-metadata')).toContainText('Ledger events');
  await page.getByTestId('proof-json-panel').locator('summary').click();
  await expect(page.getByTestId('proof-json')).toContainText('ORDER_DELIVERED');
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--pending')).toContainText('Pending');

  const proofDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Proof' }).click();
  expect((await proofDownload).suggestedFilename()).toBe(`${order.orderNumber}-proof.json`);
  await expect(page.getByTestId('proof-action-message')).toHaveText('Proof downloaded');

  await page.getByRole('button', { name: 'Verify Proof' }).click();
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--failed')).toContainText('Failed');
  await expect(page.getByTestId('proof-verification-result')).toHaveText('Proof mismatch');
  await expect(page.getByTestId('proof-state-strip')).toContainText('Proof verification failed: Proof mismatch.');

  await page.getByRole('button', { name: 'Verify Proof' }).click();
  await expect(page.getByTestId('order-proof-panel').locator('.tnl-proof-hash-card--verified')).toContainText('Verified');
  await expect(page.getByTestId('proof-verification-result')).toHaveText('Proof verified');
  await expect(page.getByTestId('proof-state-strip')).toContainText('Proof verified against the ledger hash.');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
