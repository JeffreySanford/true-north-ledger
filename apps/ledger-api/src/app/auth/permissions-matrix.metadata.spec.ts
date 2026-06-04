import { AuthController } from './auth.controller';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import { LedgerEventsController } from '../ledger-events/ledger-events.controller';

describe('Permission metadata matrix', () => {
  it('defines required permissions for protected auth controller endpoints', () => {
    const authMatrix: Array<{ method: keyof AuthController; expected: string[] }> = [
      { method: 'createServiceToken', expected: ['admin'] },
      { method: 'revokeServiceToken', expected: ['admin'] },
      { method: 'assignUserRoles', expected: ['admin'] },
      { method: 'deactivateUser', expected: ['admin'] },
    ];

    for (const entry of authMatrix) {
      const actual = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, AuthController.prototype[entry.method]);
      expect(actual).toEqual(entry.expected);
    }
  });

  it('defines required permissions for protected ledger endpoints', () => {
    const ledgerMatrix: Array<{ method: keyof LedgerEventsController; expected: string[] }> = [
      { method: 'findAll', expected: ['ledger.read'] },
      { method: 'verifyChain', expected: ['ledger.audit'] },
      { method: 'findOne', expected: ['ledger.read'] },
      { method: 'appendEvent', expected: ['ledger.write'] },
      { method: 'appendEventWithOverride', expected: ['ledger.write'] },
    ];

    for (const entry of ledgerMatrix) {
      const actual = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, LedgerEventsController.prototype[entry.method]);
      expect(actual).toEqual(entry.expected);
    }
  });
});
