import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import {
  AuthLedgerEventAction,
  type AuthLedgerEventAction as AuthLedgerEventActionType,
} from '@true-north-ledger/ledger-contracts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.disableAutoAuth', 'true');
  });
});

async function submitLogin(page: Page, username: string, password: string): Promise<void> {
  const usernameInput = page.locator('input[formcontrolname="username"]');
  const passwordInput = page.locator('input[formcontrolname="password"]');

  await expect(usernameInput).toBeVisible();
  await usernameInput.click();
  await usernameInput.fill(username);
  await expect(usernameInput).toHaveValue(username);

  await passwordInput.click();
  await passwordInput.fill(password);
  await expect(passwordInput).toHaveValue(password);

  await page.click('button[type="submit"]');
}

function createAuditEvent(action: AuthLedgerEventActionType, subjectId: string, actorId: string): Record<string, unknown> {
  return {
    id: randomUUID(),
    type: 'LEDGER_EVENT',
    actorType: 'user',
    actorId,
    subjectType: 'auth',
    subjectId,
    payload: {
      action,
      username: subjectId,
      sourceIp: '127.0.0.1',
      userAgent: 'playwright-e2e',
    },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: randomUUID(),
      correlationId: randomUUID(),
      sourceIp: '127.0.0.1',
      userAgent: 'playwright-e2e',
      payloadHash: 'a'.repeat(64),
      eventHash: 'b'.repeat(64),
      chainSequence: 1,
      result: 'accepted',
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

function parseLoginCredentials(rawBody: string | null): { username?: string; password?: string } {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as { username?: string; password?: string };
  } catch {
    const params = new URLSearchParams(rawBody);
    return {
      username: params.get('username') ?? undefined,
      password: params.get('password') ?? undefined,
    };
  }
}

test('login page authenticates and redirects to dashboard', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: {
          userId: 'admin',
          username: 'admin',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
        },
      }),
    });
  });

  await page.goto('/login');
  await page.locator('input[formcontrolname="rememberMe"]').check();
  await submitLogin(page, 'admin', 'admin');

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('h1')).toHaveText('Dashboard');
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBe('test-access-token');
  await expect(page.evaluate(() => localStorage.getItem('tnl.refreshToken'))).resolves.toBe('test-refresh-token');
});

test('disables the login button while authentication is pending', async ({ page }) => {
  let completeLogin!: () => void;
  const loginPending = new Promise<void>((resolve) => {
    completeLogin = resolve;
  });

  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await loginPending;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: {
          userId: 'admin',
          username: 'admin',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
        },
      }),
    });
  });

  await page.goto('/login');

  const submitButton = page.locator('button[type="submit"]');
  await submitLogin(page, 'admin', 'admin');

  await expect(submitButton).toBeDisabled();
  await expect(submitButton).toContainText('Signing in');

  completeLogin();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('defaults to sessionStorage when remember me is not selected', async ({ page }) => {
  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/auth/login**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'session-storage-access-token',
        refreshToken: 'session-storage-refresh-token',
        user: {
          userId: 'temp-user',
          username: 'temp-user',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read'],
        },
      }),
    });
  });

  await page.goto('/login');
  await expect(page.locator('input[formcontrolname="rememberMe"]')).not.toBeChecked();
  await submitLogin(page, 'temp-user', 'temp-user');

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.evaluate(() => sessionStorage.getItem('tnl.authToken'))).resolves.toBe('session-storage-access-token');
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();
});

test('redirects unauthenticated users to login and returns to intended route after login', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: {
          userId: 'admin',
          username: 'admin',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
        },
      }),
    });
  });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);

  await submitLogin(page, 'admin', 'admin');

  await expect(page).toHaveURL(/\/dashboard/);
});

test('fails login and remains on login page without storing a token', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid credentials' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'wrong');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();

  await expect(page.locator('.error-message')).toHaveText('Invalid credentials');
});

test('shows a rate-limit error when login is throttled', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Too many login attempts. Please retry shortly.' }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'admin');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('body')).toContainText('Login');
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();
});

test('retries protected API requests after refresh succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'expired-access-token');
    window.localStorage.setItem('tnl.refreshToken', 'valid-refresh-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'refresh-user',
        username: 'refresh-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.route('**/api/v1/ledger/events**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const authHeader = route.request().headers()['authorization'];
    if (authHeader === 'Bearer fresh-access-token') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Token expired' }),
    });
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        user: {
          userId: 'refresh-user',
          username: 'refresh-user',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read'],
        },
      }),
    });
  });

  await page.goto('/ledger-events');
  await expect(page).toHaveURL(/\/ledger-events/);
  await expect(page.locator('h1.page-heading')).toHaveText('Ledger Events');
});

test('redirects to login when refresh fails after protected API 401', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'expired-access-token');
    window.localStorage.setItem('tnl.refreshToken', 'invalid-refresh-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'refresh-fail-user',
        username: 'refresh-fail-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Token expired' }),
    });
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Refresh token invalid' }),
    });
  });

  await page.goto('/ledger-events');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();
  await expect(page.evaluate(() => localStorage.getItem('tnl.refreshToken'))).resolves.toBeNull();
});

test('redirects to login when refresh is throttled after protected API 401', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'expired-access-token');
    window.localStorage.setItem('tnl.refreshToken', 'throttled-refresh-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'refresh-throttled-user',
        username: 'refresh-throttled-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Token expired' }),
    });
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Too many refresh attempts. Please retry shortly.' }),
    });
  });

  await page.goto('/ledger-events');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();
  await expect(page.evaluate(() => localStorage.getItem('tnl.refreshToken'))).resolves.toBeNull();
});

test('unauthorized page renders access denied message', async ({ page }) => {
  await page.goto('/unauthorized');
  await expect(page.locator('h1')).toHaveText('Access denied');
  await expect(page.locator('p')).toHaveText('You do not have permission to view this page.');
});

test('hides protected navigation items for unauthenticated users', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Login' })).toBeVisible();
  await expect(page.locator('[data-testid="forgot-password-placeholder"]')).toContainText('Forgot password?');
  await expect(page.locator('[data-testid="forgot-password-placeholder"]')).toContainText('Coming in PI-2.');
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Dashboard' })).toHaveCount(0);
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Ledger Events' })).toHaveCount(0);
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Tablet Receiving' })).toHaveCount(0);
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Mobile Scan' })).toHaveCount(0);
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Settings' })).toHaveCount(0);
});

test('shows tablet navigation and hides mobile navigation when user has devices permission only', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'tablet-nav-user',
        username: 'tablet-nav-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['devices.read'],
      }),
    );
  });

  await page.goto('/dashboard');
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Tablet Receiving' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Mobile Scan' })).toHaveCount(0);
});

test('shows mobile navigation and hides tablet navigation when user has proof permission only', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'mobile-nav-user',
        username: 'mobile-nav-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['proof.read'],
      }),
    );
  });

  await page.goto('/dashboard');
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Mobile Scan' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Tablet Receiving' })).toHaveCount(0);
});

test('allows logged in user with settings permission to access settings page', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'settings-user',
        username: 'settings-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['settings.read'],
      }),
    );
  });

  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.locator('h1.page-heading')).toHaveText('Settings');
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('Secure session');
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('settings-user');
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Settings' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Dashboard' })).toHaveCount(0);
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Devices' })).toHaveCount(0);
});

test('redirects to unauthorized when logged in user lacks route permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'limited-user',
        username: 'limited',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/settings');
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.locator('h1')).toHaveText('Access denied');
});

test('redirects to unauthorized when backend returns tenant isolation violation', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'tenant-user',
        username: 'tenant-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.route('**/api/v1/ledger/events**', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Tenant isolation violation' }),
    });
  });

  await page.goto('/ledger-events');
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});

test('maintains unauthorized state after reload for a limited user', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'limited-user',
        username: 'limited',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/settings');
  await expect(page).toHaveURL(/\/unauthorized/);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Access denied');
  await expect(page).toHaveURL(/\/unauthorized/);
});

test('allows tablet receiving route for users with tablet permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'tablet-user',
        username: 'tablet-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['devices.read'],
      }),
    );
  });

  await page.goto('/tablet/receiving');
  await expect(page).toHaveURL(/\/tablet\/receiving/);
  await expect(page.locator('h1.page-heading')).toHaveText('Tablet Receiving');
});

test('denies tablet receiving route for users without tablet permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'limited-tablet-user',
        username: 'limited-tablet-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/tablet/receiving');
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.locator('h1')).toHaveText('Access denied');
});

test('allows mobile scan route for users with mobile permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'mobile-user',
        username: 'mobile-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['proof.read'],
      }),
    );
  });

  await page.goto('/mobile/scan');
  await expect(page).toHaveURL(/\/mobile\/scan/);
  await expect(page.locator('h1.page-heading')).toHaveText('Mobile Scan');
});

test('denies mobile scan route for users without mobile permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'limited-mobile-user',
        username: 'limited-mobile-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/mobile/scan');
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.locator('h1')).toHaveText('Access denied');
});

test('denies planned admin role route for users without permission and keeps 403-safe page', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'limited-role-user',
        username: 'limited-role-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/roles');
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.locator('h1')).toHaveText('Access denied');
});

test('allows planned role route for users with roles permission and renders placeholder page', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin-role-user',
        username: 'admin-role-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['roles.manage'],
      }),
    );
  });

  await page.goto('/roles');
  await expect(page).toHaveURL(/\/roles/);
  await expect(page.locator('[data-testid="feature-placeholder"]')).toContainText('Roles');
});

test('enforces planned route permission metadata matrix across web, tablet, and mobile surfaces', async ({ page }) => {
  const plannedRoutes: Array<{ path: string; expectedHeading: string }> = [
    { path: '/orders', expectedHeading: 'Orders' },
    { path: '/inventory', expectedHeading: 'Inventory' },
    { path: '/shipping', expectedHeading: 'Shipping' },
    { path: '/billing', expectedHeading: 'Billing' },
    { path: '/moderation', expectedHeading: 'Moderation' },
    { path: '/users', expectedHeading: 'Users' },
    { path: '/roles', expectedHeading: 'Roles' },
    { path: '/tablet/receiving', expectedHeading: 'Tablet Receiving' },
    { path: '/tablet/counts', expectedHeading: 'Tablet Counts' },
    { path: '/tablet/pick-pack', expectedHeading: 'Tablet Pick Pack' },
    { path: '/tablet/labeling', expectedHeading: 'Tablet Labeling' },
    { path: '/tablet/device-pairing', expectedHeading: 'Tablet Device Pairing' },
    { path: '/tablet/supervisor', expectedHeading: 'Tablet Supervisor' },
    { path: '/mobile/scan', expectedHeading: 'Mobile Scan' },
    { path: '/mobile/inventory', expectedHeading: 'Mobile Inventory Lookup' },
    { path: '/mobile/orders', expectedHeading: 'Mobile Order Lookup' },
    { path: '/mobile/approve', expectedHeading: 'Mobile Approvals' },
    { path: '/mobile/device', expectedHeading: 'Mobile Device Diagnostics' },
    { path: '/mobile/proofs', expectedHeading: 'Mobile Proof Verification' },
    { path: '/mobile/alerts', expectedHeading: 'Mobile Alerts' },
  ];

  await page.route('**/api/v1/orders**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ orders: [], total: 0, page: 1, pageSize: 20 }),
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'matrix-admin-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'matrix-admin-user',
        username: 'matrix-admin-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: [
          'orders.read',
          'inventory.read',
          'shipping.read',
          'billing.read',
          'moderation.read',
          'users.read',
          'roles.manage',
          'devices.read',
          'devices.manage',
          'admin.override.write',
          'proof.read',
        ],
      }),
    );
  });

  for (const routeCase of plannedRoutes) {
    await page.goto(routeCase.path);
    await expect(page).not.toHaveURL(/\/unauthorized/);
    await expect(page.locator('h1')).toHaveText(routeCase.expectedHeading);
  }
});

test('denies planned routes for users missing route metadata permissions across all surfaces', async ({ page }) => {
  const plannedPaths = [
    '/orders',
    '/inventory',
    '/shipping',
    '/billing',
    '/moderation',
    '/users',
    '/roles',
    '/tablet/receiving',
    '/tablet/counts',
    '/tablet/pick-pack',
    '/tablet/labeling',
    '/tablet/device-pairing',
    '/tablet/supervisor',
    '/mobile/scan',
    '/mobile/inventory',
    '/mobile/orders',
    '/mobile/approve',
    '/mobile/device',
    '/mobile/proofs',
    '/mobile/alerts',
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'matrix-limited-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'matrix-limited-user',
        username: 'matrix-limited-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  for (const path of plannedPaths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/unauthorized/);
    await expect(page.locator('h1')).toHaveText('Access denied');
  }
});

test('shows full navigation for an admin user with permissions', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin-user',
        username: 'admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
      }),
    );
  });

  await page.goto('/dashboard');
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('Secure session');
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('Authenticated user');
  await expect(page.getByLabel('Session: Verified by ledger state')).toBeVisible();
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('AD');
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Dashboard' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Ledger Events' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Devices' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Proofs' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] a', { hasText: 'Settings' })).toBeVisible();
  await expect(page.locator('nav[data-testid="app-nav"] button', { hasText: 'Logout' })).toBeVisible();
});

test('renders shared visual primitives with accessible non-color state and no horizontal overflow', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'visual-user',
        username: 'visual-admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
      }),
    );
  });

  await page.goto('/dashboard');

  await expect(page.getByLabel('Secure session: Authenticated user')).toBeVisible();
  await expect(page.getByLabel('Session: Verified by ledger state')).toBeVisible();
  await expect(page.getByLabel('Ledger chain: Ready for verification')).toBeVisible();
  await expect(page.getByLabel('Audit posture: Verification pending')).toBeVisible();
  await expect(page.getByLabel('Warning: Role setup incomplete')).toBeVisible();
  await expect(page.getByLabel('API: Connected. Development API readiness placeholder')).toBeVisible();
  await expect(page.getByLabel('Verify your first ledger event: Ready. Derived from authenticated server state for visual-admin')).toBeVisible();
  await expect(page.getByLabel('Auth setup progress: 2 of 3 complete')).toBeVisible();
  await expect(page.getByLabel('Auth setup progress: 2 of 3 complete')).toContainText('Roles seeded');
  await expect(page.getByLabel('Auth setup progress: 2 of 3 complete')).toContainText('Pending');
  await expect(
    page.getByLabel('LOGIN_SUCCESS: Accepted. Actor admin. Subject session. Hash pending-server-ledger-hash.'),
  ).toBeVisible();
  await expect(
    page.getByLabel('LOGIN_SUCCESS: Accepted. Actor admin. Subject session. Hash pending-server-ledger-hash.'),
  ).toContainText('Fixture until live ledger events are loaded');
  await expect(page.getByLabel('Mission onboarding pending')).toContainText('Server-backed setup missions');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test('logs out and redirects to login', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'test-access-token');
    window.localStorage.setItem('tnl.refreshToken', 'test-refresh-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'admin',
        username: 'admin',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
      }),
    );
  });

  await page.route('**/api/v1/auth/logout', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.click('button:text("Logout")');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.evaluate(() => localStorage.getItem('tnl.authToken'))).resolves.toBeNull();
  await expect(page.evaluate(() => localStorage.getItem('tnl.authUser'))).resolves.toBeNull();
});

test('secure session chip, role-aware icon, and mission state render from authenticated login response', async ({ page }) => {
  await page.route('**/api/v1/auth/login**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'server-auth-token',
        refreshToken: 'server-refresh-token',
        user: {
          userId: 'admin',
          username: 'server-admin',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['admin', 'ledger.read', 'roles.manage', 'settings.read'],
        },
      }),
    });
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);

  await expect(page.locator('[data-testid="secure-session"]')).toContainText('Secure session');
  await expect(page.locator('[data-testid="secure-session"]')).toContainText('server-admin');
  await expect(page.getByLabel('Role icon: admin_panel_settings')).toBeVisible();
  await expect(page.getByLabel('Role profile: Administrator')).toBeVisible();
  await expect(
    page.getByLabel('Verify your first ledger event: Complete. Derived from authenticated server state for server-admin'),
  ).toBeVisible();
});

test('reduced-motion mode disables route and card animations while preserving readable state cues', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.addInitScript(() => {
    window.localStorage.setItem('tnl.authToken', 'reduced-motion-token');
    window.localStorage.setItem(
      'tnl.authUser',
      JSON.stringify({
        userId: 'motion-user',
        username: 'motion-user',
        actorType: 'user',
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      }),
    );
  });

  await page.goto('/dashboard');
  await expect(page.locator('h1.page-heading')).toHaveText('Dashboard');
  await expect(page.getByLabel('Role profile: Operator')).toBeVisible();
  await expect(
    page.getByLabel('Verify your first ledger event: Ready. Derived from authenticated server state for motion-user'),
  ).toBeVisible();

  const reducedMotionStyles = await page.evaluate(() => {
    const routeHost = document.querySelector('.app-body > *') as HTMLElement | null;
    const firstCard = document.querySelector('.section-card') as HTMLElement | null;
    const missionCard = document.querySelector('.tnl-mission-card') as HTMLElement | null;

    if (!routeHost || !firstCard || !missionCard) {
      return null;
    }

    const routeStyle = getComputedStyle(routeHost);
    const cardStyle = getComputedStyle(firstCard);
    const missionStyle = getComputedStyle(missionCard);

    return {
      routeAnimationName: routeStyle.animationName,
      routeAnimationDuration: routeStyle.animationDuration,
      cardAnimationName: cardStyle.animationName,
      cardTransitionDuration: cardStyle.transitionDuration,
      missionAnimationName: missionStyle.animationName,
    };
  });

  expect(reducedMotionStyles).not.toBeNull();
  expect(reducedMotionStyles?.routeAnimationName).toBe('none');
  expect(reducedMotionStyles?.routeAnimationDuration).toBe('0s');
  expect(reducedMotionStyles?.cardAnimationName).toBe('none');
  expect(reducedMotionStyles?.cardTransitionDuration).toContain('0s');
  expect(reducedMotionStyles?.missionAnimationName).toBe('none');
});

test('login creates an audit event visible in ledger events with metadata', async ({ page }) => {
  const events: Record<string, unknown>[] = [];

  await page.route('**/api/v1/auth/login**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    const body = parseLoginCredentials(request.postData());
    if (body.username === 'admin' && body.password === 'admin') {
      events.unshift(createAuditEvent(AuthLedgerEventAction.LOGIN_SUCCESS, 'admin', 'admin'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'audit-admin-token',
          refreshToken: 'audit-admin-refresh',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });

  await page.route('**/api/v1/ledger/events', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/ledger-events');

  const loginSuccessRow = page.locator('[data-testid="ledger-event-row"]', { hasText: AuthLedgerEventAction.LOGIN_SUCCESS });
  await expect(loginSuccessRow).toBeVisible();
  await expect(loginSuccessRow).toContainText('Actor: user / admin');
  await expect(loginSuccessRow).toContainText('Result: accepted');
  await expect(loginSuccessRow).toContainText('Request:');
  await expect(loginSuccessRow).toContainText('Correlation:');
  await expect(loginSuccessRow).toContainText('Source IP: 127.0.0.1');
  await expect(loginSuccessRow).toContainText('User Agent: playwright-e2e');
});

test('failed login creates an audit event visible after admin login', async ({ page }) => {
  const events: Record<string, unknown>[] = [];

  await page.route('**/api/v1/auth/login**', async (route) => {
    const body = parseLoginCredentials(route.request().postData());

    if (body.username === 'admin' && body.password === 'admin') {
      events.unshift(createAuditEvent(AuthLedgerEventAction.LOGIN_SUCCESS, 'admin', 'admin'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'audit-admin-token',
          refreshToken: 'audit-admin-refresh',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    events.unshift(createAuditEvent(AuthLedgerEventAction.LOGIN_FAILED, body.username ?? 'unknown', body.username ?? 'unknown'));
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });

  await page.route('**/api/v1/ledger/events', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'wrong-password');
  await expect(page).toHaveURL(/\/login/);

  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/ledger-events');

  const loginFailedRow = page.locator('[data-testid="ledger-event-row"]', { hasText: AuthLedgerEventAction.LOGIN_FAILED });
  await expect(loginFailedRow).toBeVisible();
  await expect(loginFailedRow).toContainText('Actor: user / admin');
});

test('permission denial creates an audit event visible in ledger events', async ({ page }) => {
  const events: Record<string, unknown>[] = [];

  await page.route('**/api/v1/auth/login**', async (route) => {
    const body = parseLoginCredentials(route.request().postData());

    if (body.username === 'limited' && body.password === 'limited') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'limited-token',
          refreshToken: 'limited-refresh-token',
          user: {
            userId: 'limited-user',
            username: 'limited',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read'],
          },
        }),
      });
      return;
    }

    if (body.username === 'admin' && body.password === 'admin') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'admin-token',
          refreshToken: 'admin-refresh-token',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });

  await page.route('**/api/v1/auth/logout', async (route) => {
    await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/v1/auth/service-token', async (route) => {
    if (route.request().method() === 'POST') {
      events.unshift(createAuditEvent(AuthLedgerEventAction.PERMISSION_DENIED, 'limited-user', 'limited-user'));
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Required permission missing' }),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: randomUUID(), token: 'service-token' }),
    });
  });

  await page.route('**/api/v1/ledger/events', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'limited', 'limited');
  await expect(page).toHaveURL(/\/dashboard/);

  const deniedStatus = await page.evaluate(async () => {
    const token = window.localStorage.getItem('tnl.authToken') ?? '';
    const response = await fetch('/api/v1/auth/service-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'denied-token', permissions: ['admin'] }),
    });

    return response.status;
  });

  expect(deniedStatus).toBe(403);
  await page.click('button:text("Logout")');

  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/ledger-events');

  const permissionDeniedRow = page.locator('[data-testid="ledger-event-row"]', { hasText: AuthLedgerEventAction.PERMISSION_DENIED });
  await expect(permissionDeniedRow).toBeVisible();
  await expect(permissionDeniedRow).toContainText('Actor: user / limited-user');
  await expect(permissionDeniedRow).toContainText('Source IP: 127.0.0.1');
  await expect(permissionDeniedRow).toContainText('User Agent: playwright-e2e');
});

test('logout creates an audit event visible after next login', async ({ page }) => {
  const events: Record<string, unknown>[] = [];

  await page.route('**/api/v1/auth/login**', async (route) => {
    const body = parseLoginCredentials(route.request().postData());

    if (body.username === 'admin' && body.password === 'admin') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'admin-token',
          refreshToken: 'admin-refresh-token',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });

  await page.route('**/api/v1/auth/logout', async (route) => {
    events.unshift(createAuditEvent(AuthLedgerEventAction.LOGOUT, 'admin', 'admin'));
    await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/v1/ledger/events', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);

  await page.click('button:text("Logout")');
  await expect(page).toHaveURL(/\/login/);

  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/ledger-events');

  const logoutRow = page.locator('[data-testid="ledger-event-row"]', { hasText: AuthLedgerEventAction.LOGOUT });
  await expect(logoutRow).toBeVisible();
  await expect(logoutRow).toContainText('Actor: user / admin');
  await expect(logoutRow).toContainText('Source IP: 127.0.0.1');
  await expect(logoutRow).toContainText('User Agent: playwright-e2e');
});

test('token refresh creates an audit event visible in ledger events', async ({ page }) => {
  const events: Record<string, unknown>[] = [];

  await page.route('**/api/v1/auth/login**', async (route) => {
    const body = parseLoginCredentials(route.request().postData());

    if (body.username === 'admin' && body.password === 'admin') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'admin-token',
          refreshToken: 'admin-refresh-token',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    if (route.request().method() === 'POST') {
      events.unshift(createAuditEvent(AuthLedgerEventAction.TOKEN_REFRESHED, 'admin', 'admin'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'admin-token-rotated',
          refreshToken: 'admin-refresh-token-rotated',
          user: {
            userId: 'admin',
            username: 'admin',
            actorType: 'user',
            tenantId: '00000000-0000-0000-0000-000000000000',
            permissions: ['ledger.read', 'settings.read'],
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/v1/ledger/events', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await submitLogin(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/dashboard/);

  const refreshStatus = await page.evaluate(async () => {
    const refreshToken = window.localStorage.getItem('tnl.refreshToken') ?? '';
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    return response.status;
  });

  expect(refreshStatus).toBe(200);

  await page.goto('/ledger-events');

  const refreshedRow = page.locator('[data-testid="ledger-event-row"]', { hasText: AuthLedgerEventAction.TOKEN_REFRESHED });
  await expect(refreshedRow).toBeVisible();
  await expect(refreshedRow).toContainText('Actor: user / admin');
  await expect(refreshedRow).toContainText('Result: accepted');
  await expect(refreshedRow).toContainText('Source IP: 127.0.0.1');
  await expect(refreshedRow).toContainText('User Agent: playwright-e2e');
});
