import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROLE_NAMES, ROLE_PERMISSION_CATALOG } from './role-permissions';

describe('rbac-and-views documentation alignment', () => {
  const docsPath = path.resolve(__dirname, '../../../../../documentation/platform/rbac-and-views.md');
  const docsContent = readFileSync(docsPath, 'utf8');
  const docsIndexPath = path.resolve(__dirname, '../../../../../documentation/README.md');
  const docsIndexContent = readFileSync(docsIndexPath, 'utf8');

  it('documents every implemented default role key', () => {
    for (const role of ROLE_NAMES) {
      expect(docsContent).toContain(`\`${role}\``);
    }
  });

  it('documents every implemented permission in the catalog', () => {
    const permissions = new Set<string>();

    for (const role of ROLE_NAMES) {
      for (const permission of ROLE_PERMISSION_CATALOG[role]) {
        permissions.add(permission);
      }
    }

    for (const permission of permissions) {
      expect(docsContent).toContain(`\`${permission}\``);
    }
  });

  it('documents the implemented frontend route permission and surface matrix entries', () => {
    const expectedRows = [
      '| `/dashboard` | `web` | `ledger.read` |',
      '| `/ledger-events` | `web` | `ledger.read` |',
      '| `/devices` | `web` | `devices.read` |',
      '| `/orders` | `web` | `orders.read` |',
      '| `/inventory` | `web` | `inventory.read` |',
      '| `/shipping` | `web` | `shipping.read` |',
      '| `/billing` | `web` | `billing.read` |',
      '| `/moderation` | `web` | `moderation.read` |',
      '| `/users` | `web` | `users.read` |',
      '| `/roles` | `web` | `roles.manage` |',
      '| `/proofs` | `web` | `proof.read` |',
      '| `/settings` | `web` | `settings.read` |',
      '| `/tablet/receiving` | `tablet` | `devices.read` |',
      '| `/tablet/counts` | `tablet` | `inventory.read` |',
      '| `/tablet/pick-pack` | `tablet` | `shipping.read` |',
      '| `/tablet/labeling` | `tablet` | `shipping.read` |',
      '| `/tablet/device-pairing` | `tablet` | `devices.manage` |',
      '| `/tablet/supervisor` | `tablet` | `admin.override.write` |',
      '| `/mobile/scan` | `mobile` | `proof.read` |',
      '| `/mobile/inventory` | `mobile` | `inventory.read` |',
      '| `/mobile/orders` | `mobile` | `orders.read` |',
      '| `/mobile/approve` | `mobile` | `admin.override.write` |',
      '| `/mobile/device` | `mobile` | `devices.manage` |',
      '| `/mobile/proofs` | `mobile` | `proof.read` |',
      '| `/mobile/alerts` | `mobile` | `moderation.read` |',
    ];

    for (const row of expectedRows) {
      expect(docsContent).toContain(row);
    }
  });

  it('indexes Sprint 1 integration guides in documentation README', () => {
    expect(docsIndexContent).toContain('Frontend Login Flow Guide');
    expect(docsIndexContent).toContain('Service Token Integration Guide for Partners');
  });
});
