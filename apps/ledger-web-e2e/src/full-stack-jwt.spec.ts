import { expect, test } from '@playwright/test';
import { createHmac, randomUUID } from 'crypto';

interface JwtPayload {
  sub: string;
  actorType: 'user';
  tenantId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

const tenantId = '00000000-0000-0000-0000-000000000000';

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET is required for full-stack JWT E2E tests.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url({
    ...payload,
    iat: now,
    exp: now + 300,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test.describe('ledger-web full-stack JWT flow', () => {
  test.beforeEach(async ({ request }) => {
    await expect
      .poll(
        async () => {
          const response = await request.get('/api/v1/ledger/events');
          return response.status();
        },
        {
          timeout: 30_000,
          intervals: [500, 1_000, 2_000],
        },
      )
      .toBe(401);
  });

  test('creates and reloads a ledger event through UI, API, and database', async ({ page }) => {
    const actorId = `ui-e2e-${randomUUID()}`;
    const token = createJwt({
      sub: actorId,
      actorType: 'user',
      tenantId,
      permissions: ['read', 'write'],
    });

    await page.addInitScript((authToken) => {
      window.localStorage.setItem('tnl.authToken', authToken);
    }, token);

    await page.goto('/ledger-events');
    await expect(page.locator('h1')).toHaveText('Ledger Events');

    await page.getByRole('button', { name: 'Create demo event' }).click();
    await expect(page.locator('[data-testid="ledger-event-row"]').filter({ hasText: actorId })).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="ledger-event-row"]').filter({ hasText: actorId })).toBeVisible();
  });

  test('renders a clear authorization error when no JWT is available', async ({ page }) => {
    await page.goto('/ledger-events');

    await expect(page.locator('[data-testid="ledger-events-error"]')).toContainText('Unauthorized');
  });

  test('renders a clear authorization error when the JWT signature is invalid', async ({ page }) => {
    const invalidToken = [
      base64Url({ alg: 'HS256', typ: 'JWT' }),
      base64Url({
        sub: 'ui-e2e-invalid',
        actorType: 'user',
        tenantId,
        permissions: ['read', 'write'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
      'invalid-signature',
    ].join('.');

    await page.addInitScript((authToken) => {
      window.localStorage.setItem('tnl.authToken', authToken);
    }, invalidToken);

    await page.goto('/ledger-events');

    await expect(page.locator('[data-testid="ledger-events-error"]')).toContainText('Unauthorized');
  });
});
