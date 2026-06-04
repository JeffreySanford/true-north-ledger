import { describe, expect, it } from 'vitest';
import { appRoutes } from './app.routes';

describe('appRoutes metadata', () => {
  const securedRoutes = appRoutes.filter((route) => route.canActivate?.length);

  it('assigns permission and surface metadata to every secured route', () => {
    for (const route of securedRoutes) {
      const routeData = route.data as { requiredPermissions?: string[]; surface?: string } | undefined;

      expect(routeData?.requiredPermissions?.length ?? 0).toBeGreaterThan(0);
      expect(['web', 'tablet', 'mobile', 'public']).toContain(routeData?.surface);
    }
  });

  it('contains planned route entries for web, tablet, and mobile role workflows', () => {
    const routePaths = new Set(appRoutes.map((route) => route.path));

    const requiredPaths = [
      'orders',
      'inventory',
      'shipping',
      'billing',
      'moderation',
      'users',
      'roles',
      'tablet/counts',
      'tablet/pick-pack',
      'tablet/labeling',
      'tablet/device-pairing',
      'tablet/supervisor',
      'mobile/inventory',
      'mobile/orders',
      'mobile/approve',
      'mobile/device',
      'mobile/proofs',
      'mobile/alerts',
    ];

    for (const path of requiredPaths) {
      expect(routePaths.has(path)).toBe(true);
    }
  });

  it('matches expected permission and surface metadata matrix for planned routes', () => {
    const expectedMatrix: Array<{ path: string; requiredPermission: string; surface: string }> = [
      { path: 'orders', requiredPermission: 'orders.read', surface: 'web' },
      { path: 'inventory', requiredPermission: 'inventory.read', surface: 'web' },
      { path: 'shipping', requiredPermission: 'shipping.read', surface: 'web' },
      { path: 'billing', requiredPermission: 'billing.read', surface: 'web' },
      { path: 'moderation', requiredPermission: 'moderation.read', surface: 'web' },
      { path: 'users', requiredPermission: 'users.read', surface: 'web' },
      { path: 'roles', requiredPermission: 'roles.manage', surface: 'web' },
      { path: 'tablet/receiving', requiredPermission: 'devices.read', surface: 'tablet' },
      { path: 'tablet/counts', requiredPermission: 'inventory.read', surface: 'tablet' },
      { path: 'tablet/pick-pack', requiredPermission: 'shipping.read', surface: 'tablet' },
      { path: 'tablet/labeling', requiredPermission: 'shipping.read', surface: 'tablet' },
      { path: 'tablet/device-pairing', requiredPermission: 'devices.manage', surface: 'tablet' },
      { path: 'tablet/supervisor', requiredPermission: 'admin.override.write', surface: 'tablet' },
      { path: 'mobile/scan', requiredPermission: 'proof.read', surface: 'mobile' },
      { path: 'mobile/inventory', requiredPermission: 'inventory.read', surface: 'mobile' },
      { path: 'mobile/orders', requiredPermission: 'orders.read', surface: 'mobile' },
      { path: 'mobile/approve', requiredPermission: 'admin.override.write', surface: 'mobile' },
      { path: 'mobile/device', requiredPermission: 'devices.manage', surface: 'mobile' },
      { path: 'mobile/proofs', requiredPermission: 'proof.read', surface: 'mobile' },
      { path: 'mobile/alerts', requiredPermission: 'moderation.read', surface: 'mobile' },
    ];

    for (const expected of expectedMatrix) {
      const route = appRoutes.find((entry) => entry.path === expected.path);
      expect(route).toBeTruthy();

      const routeData = route?.data as { requiredPermissions?: string[]; surface?: string } | undefined;
      expect(routeData?.requiredPermissions).toEqual([expected.requiredPermission]);
      expect(routeData?.surface).toBe(expected.surface);
    }
  });

  it('resolves every lazy route module used by sprint 1 navigation', async () => {
    const lazyRoutes = appRoutes.filter((route) => route.loadChildren);

    await Promise.all(
      lazyRoutes.map(async (route) => {
        const loaded = await route.loadChildren?.();
        expect(loaded).toBeTruthy();
      }),
    );
  });
});
