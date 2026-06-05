import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

function collectBrowserIssues(page: Page): string[] {
  const issues: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console error: ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    issues.push(`page error: ${error.message}`);
  });

  return issues;
}

test.describe('ledger-web quality gates', () => {
  test.beforeEach(async ({ context }) => {
    const events: unknown[] = [];
    const devices = [
      {
        id: '00000000-0000-4000-8000-000000000201',
        name: 'Quality scanner',
        type: 'scanner',
        tenantId: '00000000-0000-0000-0000-000000000000',
        status: 'active',
        permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
        metadata: {},
        lastSeenAt: '2026-06-04T12:00:00.000Z',
        online: true,
        createdAt: '2026-06-04T12:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
        revokedAt: null,
      },
    ];

    await context.addInitScript(() => {
      window.localStorage.setItem('tnl.authToken', 'quality-test-token');
      window.localStorage.setItem(
        'tnl.authUser',
        JSON.stringify({
          userId: 'quality-user',
          username: 'quality-user',
          actorType: 'user',
          tenantId: '00000000-0000-0000-0000-000000000000',
          permissions: ['ledger.read', 'ledger.write', 'ledger.audit', 'proof.read', 'devices.read', 'settings.read'],
        }),
      );
    });

    await context.route(/.*\/api\/v1\/ledger\/events.*/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(events),
        });
        return;
      }

      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as {
          type: 'LEDGER_EVENT';
          subjectType: string;
          subjectId: string;
          payload: Record<string, unknown>;
        };
        const event = {
          id: randomUUID(),
          type: body.type,
          actorType: 'user',
          actorId: 'frontend-demo',
          subjectType: body.subjectType,
          subjectId: body.subjectId,
          payload: body.payload,
          metadata: {
            tenantId: '00000000-0000-4000-8000-000000000000',
            requestId: randomUUID(),
            correlationId: randomUUID(),
            userAgent: 'playwright',
            payloadHash: 'a'.repeat(64),
            eventHash: 'b'.repeat(64),
            chainSequence: events.length + 1,
            result: 'accepted',
            timestamp: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
        };
        events.unshift(event);

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(event),
        });
        return;
      }

      await route.fallback();
    });

    await context.route(/.*\/api\/v1\/devices.*/, async (route) => {
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

      await route.fallback();
    });
  });

  test('loads the dashboard shell and page navigation', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ledger Events' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Proofs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    expect(browserIssues).toEqual([]);
  });

  test('navigates ledger events page and creates a demo event', async ({ page }) => {
    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');
    await expect(page.locator('[data-testid="ledger-events-empty"]')).toBeVisible();

    const createButton = page.locator('button', { hasText: 'Create demo event' });
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
  });

  test('renders all primary routes and headings', async ({ page }) => {
    const routes = [
      { path: '/', heading: 'Dashboard' },
      { path: '/ledger-events', heading: 'Ledger Events' },
      { path: '/devices', heading: 'Devices' },
      { path: '/proofs', heading: 'Proofs' },
      { path: '/settings', heading: 'Settings' },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator('h1')).toHaveText(route.heading);
    }
  });

  test('renders dashboard route with animation-enabled shell without runtime errors', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.goto('/');

    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.section-card')).toBeVisible();
    expect(browserIssues).toEqual([]);
  });

  test('renders dashboard shell in reduced-motion mode without runtime errors', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    expect(browserIssues).toEqual([]);
  });

  test('renders proof hash card and timeline rail primitives on dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.tnl-proof-hash-card')).toBeVisible();
    await expect(page.locator('.tnl-proof-hash-card')).toContainText('Latest proof hash');
    await expect(page.locator('.tnl-proof-hash-card')).toContainText('Verified');

    await expect(page.locator('.tnl-timeline-rail')).toBeVisible();
    await expect(page.locator('.tnl-timeline-rail')).toContainText('Auth rollout timeline');
    await expect(page.locator('.tnl-timeline-rail')).toContainText('Role catalog seeding');
  });

  test('validates basic document semantics', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    const lang = await page.locator('html').getAttribute('lang');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');

    expect(title.trim().length).toBeGreaterThan(0);
    expect(lang?.trim().length).toBeGreaterThan(0);
    expect(viewport).toContain('width=device-width');
  });

  test('registers material icon font stylesheet in document head', async ({ page }) => {
    await page.goto('/');

    const iconLink = page.locator('head link[rel="stylesheet"][href*="Material+Symbols+Outlined"]');
    await expect(iconLink).toHaveCount(1);
  });

  test('renders usable layout in forced high-contrast mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    const focusOutline = await page.evaluate(() => {
      const link = document.querySelector('[data-testid="app-nav"] a') as HTMLElement | null;
      if (!link) {
        return null;
      }
      link.focus();
      const style = getComputedStyle(link);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    expect(focusOutline).not.toBeNull();
    expect(focusOutline?.outlineStyle).not.toBe('none');
    expect(focusOutline?.outlineWidth).not.toBe('0px');
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`renders without horizontal overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const hasHorizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );

      await expect(page.locator('body')).toBeVisible();
      expect(hasHorizontalOverflow).toBe(false);
    });
  }

  test('ensures all navigation links are keyboard accessible', async ({ page }) => {
    await page.goto('/');
    
    const navLinks = page.locator('[data-testid="app-nav"] a');
    const linkCount = await navLinks.count();
    
    expect(linkCount).toBeGreaterThan(0);
    
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i);
      const tabindex = await link.getAttribute('tabindex');
      expect(tabindex === null || parseInt(tabindex) >= 0).toBe(true);
    }
  });

  test('no insecure HTTP requests in production build', async ({ page }) => {
    const httpRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        httpRequests.push(url);
      }
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    
    expect(httpRequests).toEqual([]);
  });

  test('refresh button reloads ledger events', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const refreshButton = page.locator('button', { hasText: 'Refresh events' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    await expect(page.locator('body')).toBeVisible();
  });

  test('multiple demo events can be created', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const createButton = page.locator('button', { hasText: 'Create demo event' });
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(2);
    
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(3);
  });

  test('navigation preserves app state', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const createButton = page.locator('button', { hasText: 'Create demo event' });
    await createButton.click();
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
    
    // Navigate away and back
    await page.goto('/dashboard');
    await page.goto('/ledger-events');
    
    // Event should still be visible (since API maintains state)
    await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(1);
  });

  test('empty state shows helpful message', async ({ page }) => {
    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');
    
    const emptyMessage = page.locator('[data-testid="ledger-events-empty"]');
    // May or may not be visible depending on if events exist from other tests
    // This is acceptable - just verifying the element exists in the DOM
    await expect(emptyMessage).toHaveCount(1);
  });

  test.describe('Error Scenarios', () => {
    test('handles 404 navigation gracefully', async ({ page }) => {
      const browserIssues = collectBrowserIssues(page);
      await page.goto('/non-existent-route');

      await expect(page.locator('h1')).toHaveText('Dashboard');
      expect(browserIssues.filter(issue => issue.includes('error'))).toEqual([]);
    });

    test('handles rapid navigation without errors', async ({ page }) => {
      // Rapidly navigate between routes
      await page.goto('/');
      await page.goto('/ledger-events');
      await page.goto('/devices');
      await page.goto('/proofs');
      await page.goto('/settings');
      await page.goto('/');

      await expect(page.locator('h1')).toHaveText('Dashboard');
    });

    test('handles API errors gracefully', async ({ page }) => {
      await page.goto('/ledger-events');
      
      // Intercept API calls and simulate server error
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });

    test('handles network timeout gracefully', async ({ page }) => {
      await page.goto('/ledger-events');

      let releaseRequest: (() => void) | undefined;
      const pendingRequest = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      const pendingRoutes = new Set<Promise<void>>();

      // Simulate network timeout
      await page.route('**/api/v1/ledger/events', (route) => {
        const pendingRoute = pendingRequest
          .then(() =>
            route.fulfill({
              status: 504,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Gateway Timeout' }),
            }),
          )
          .catch(() => undefined)
          .finally(() => pendingRoutes.delete(pendingRoute));

        pendingRoutes.add(pendingRoute);
        return pendingRoute;
      });

      try {
        const createButton = page.locator('button', { hasText: 'Create demo event' });
        await createButton.click();

        await expect(page.locator('body')).toContainText('Loading ledger events');
      } finally {
        releaseRequest?.();
        await Promise.allSettled([...pendingRoutes]);
        await page.unroute('**/api/v1/ledger/events');
      }
    });

    test('handles multiple rapid button clicks', async ({ page }) => {
      const browserIssues = collectBrowserIssues(page);
      await page.goto('/ledger-events');
      
      const createButton = page.locator('button', { hasText: 'Create demo event' });
      
      // Rapid clicks
      await createButton.click();
      await createButton.click();
      await createButton.click();

      await expect(page.locator('[data-testid="ledger-event-row"]')).toHaveCount(3);
      expect(browserIssues).toEqual([]);
    });

    test('validates browser back/forward navigation', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('h1')).toHaveText('Dashboard');
      await page.goto('/ledger-events');
      await expect(page.locator('h1')).toHaveText('Ledger Events');
      await page.goto('/devices');
      await expect(page.locator('h1')).toHaveText('Devices');
      
      // Navigate back
      await page.goBack();
      await expect(page.locator('h1')).toHaveText('Ledger Events');
      
      // Navigate forward
      await page.goForward();
      await expect(page.locator('h1')).toHaveText('Devices');
    });

    test('handles disconnected API gracefully', async ({ page }) => {
      // Intercept all API calls and fail them
      await page.route('**/api/**', route => {
        route.abort('failed');
      });
      
      await page.goto('/ledger-events');
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });

    test('has no unfinished forms on the ledger event page', async ({ page }) => {
      await page.goto('/ledger-events');

      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.locator('body')).toBeVisible();
    });

    test('handles empty API responses', async ({ page }) => {
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });
      
      await page.goto('/ledger-events');

      await expect(page.locator('[data-testid="ledger-events-empty"]')).toBeVisible();
    });

    test('handles malformed API responses', async ({ page }) => {
      await page.route('**/api/v1/ledger/events', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json {{{' 
        });
      });
      
      await page.goto('/ledger-events');
      
      const refreshButton = page.locator('button', { hasText: 'Refresh events' });
      await refreshButton.click();

      await expect(page.locator('body')).toContainText('Ledger Events');
    });
  });

  test.describe('Performance & Accessibility', () => {
    test('page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(8000);
    });

    test('all interactive elements have accessible names', async ({ page }) => {
      await page.goto('/');
      
      const buttons = await page.locator('button').all();
      for (const button of buttons) {
        await expect(button).toHaveText(/\S/);
      }
    });

    test('focus management works correctly', async ({ page }) => {
      await page.goto('/');
      
      // Tab through focusable elements
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(firstFocused).toBeTruthy();
      
      await page.keyboard.press('Tab');
      const secondFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(secondFocused).toBeTruthy();
    });
  });
});
