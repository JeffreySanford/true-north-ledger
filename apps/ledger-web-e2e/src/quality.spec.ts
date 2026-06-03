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
  test('loads without browser errors or insecure external requests', async ({
    page,
  }) => {
    const browserIssues = collectBrowserIssues(page);
    const insecureRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      const isLocalHttp =
        url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1');

      if (url.startsWith('http://') && !isLocalHttp) {
        insecureRequests.push(url);
      }
    });

    await page.goto('/');
    await expect(page.locator('tnl-root')).toBeVisible();

    expect(browserIssues).toEqual([]);
    expect(insecureRequests).toEqual([]);
  });

  test('exposes basic document semantics', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    const lang = await page.locator('html').getAttribute('lang');
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');

    await expect(page.locator('tnl-root')).toBeVisible();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(lang?.trim().length).toBeGreaterThan(0);
    expect(viewport).toContain('width=device-width');
  });

  test('keeps outbound links protected', async ({ page }) => {
    await page.goto('/');

    const unsafeLinks = await page
      .locator('a[target="_blank"]')
      .evaluateAll((links) =>
        links
          .filter((link) => {
            const rel = link.getAttribute('rel') ?? '';

            return !rel.split(/\s+/).includes('noreferrer');
          })
          .map((link) => link.getAttribute('href')),
      );

    expect(unsafeLinks).toEqual([]);
  });

  test('does not expose secret-like values in browser storage', async ({
    page,
  }) => {
    await page.goto('/');

    const exposedValues = await page.evaluate(() => {
      const sensitiveKeyPattern =
        /(token|secret|password|credential|api[-_]?key|private[-_]?key|session)/i;
      const sensitiveValuePattern =
        /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16})/;
      const stores = [localStorage, sessionStorage];

      return stores.flatMap((store) =>
        Array.from({ length: store.length }, (_, index) => {
          const key = store.key(index) ?? '';
          const value = store.getItem(key) ?? '';

          return { key, value };
        }).filter(
          ({ key, value }) =>
            sensitiveKeyPattern.test(key) || sensitiveValuePattern.test(value),
        ),
      );
    });

    expect(exposedValues).toEqual([]);
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`renders without horizontal overflow on ${viewport.name}`, async ({
      page,
    }) => {
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
});
