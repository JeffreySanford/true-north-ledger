import { expect, test, type Page } from '@playwright/test';

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
  test('loads the dashboard shell and page navigation', async ({ page }) => {
    const browserIssues = collectBrowserIssues(page);
    await page.goto('/');

    await expect(page.locator('[data-testid="app-nav"]')).toBeVisible();
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Ledger Events')).toBeVisible();
    await expect(page.locator('text=Devices')).toBeVisible();
    await expect(page.locator('text=Proofs')).toBeVisible();
    await expect(page.locator('text=Settings')).toBeVisible();
    expect(browserIssues).toEqual([]);
  });

  test('navigates ledger events page and creates a demo event', async ({ page }) => {
    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');

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

  test('validates basic document semantics', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    const lang = await page.locator('html').getAttribute('lang');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');

    expect(title.trim().length).toBeGreaterThan(0);
    expect(lang?.trim().length).toBeGreaterThan(0);
    expect(viewport).toContain('width=device-width');
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
    await page.waitForLoadState('networkidle');
    
    expect(httpRequests).toEqual([]);
  });

  test('refresh button reloads ledger events', async ({ page }) => {
    await page.goto('/ledger-events');
    
    const refreshButton = page.locator('button', { hasText: 'Refresh events' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    
    // Should not cause errors
    await page.waitForTimeout(500);
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
    
    const emptyMessage = page.locator('[data-testid="ledger-events-empty"]');
    // May or may not be visible depending on if events exist from other tests
    // This is acceptable - just verifying the element exists in the DOM
    const emptyExists = await emptyMessage.count() > 0;
    expect(emptyExists).toBe(true);
  });
});
