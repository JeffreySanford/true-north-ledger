import { ROLE_NAMES, ROLE_PERMISSION_CATALOG } from './role-permissions';

describe('role-permissions catalog', () => {
  it('includes all documented Sprint 1 default roles', () => {
    expect(ROLE_NAMES.sort()).toEqual([
      'admin',
      'auditor',
      'billing',
      'device_technician',
      'inventory',
      'moderator',
      'operations_manager',
      'shipping',
      'support',
      'viewer',
    ]);
  });

  it('maps each role to at least one permission', () => {
    for (const role of ROLE_NAMES) {
      expect(ROLE_PERMISSION_CATALOG[role].length).toBeGreaterThan(0);
    }
  });

  it('enforces key permission expectations for critical roles', () => {
    expect(ROLE_PERMISSION_CATALOG.admin).toEqual(
      expect.arrayContaining(['admin', 'users.manage', 'roles.manage', 'settings.write']),
    );

    expect(ROLE_PERMISSION_CATALOG.operations_manager).toEqual(
      expect.arrayContaining(['orders.write', 'inventory.write', 'shipping.write', 'ledger.audit']),
    );

    expect(ROLE_PERMISSION_CATALOG.viewer).toEqual(
      expect.arrayContaining(['ledger.read', 'proof.read', 'orders.read']),
    );
    expect(ROLE_PERMISSION_CATALOG.viewer).not.toEqual(
      expect.arrayContaining(['ledger.write', 'users.manage', 'roles.manage']),
    );
  });
});
