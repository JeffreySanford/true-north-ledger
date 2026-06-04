import {
  AuthLedgerEventAction,
  AuthLedgerEventActionSchema,
  AuthLedgerEventSchema,
} from '@true-north-ledger/ledger-contracts';

describe('Auth ledger event contracts', () => {
  it('accepts all required auth event action names', () => {
    const actions = [
      AuthLedgerEventAction.LOGIN_SUCCESS,
      AuthLedgerEventAction.LOGIN_FAILED,
      AuthLedgerEventAction.LOGOUT,
      AuthLedgerEventAction.TOKEN_REFRESHED,
      AuthLedgerEventAction.SERVICE_TOKEN_CREATED,
      AuthLedgerEventAction.SERVICE_TOKEN_REVOKED,
      AuthLedgerEventAction.PERMISSION_DENIED,
      AuthLedgerEventAction.RATE_LIMIT_EXCEEDED,
    ];

    for (const action of actions) {
      expect(AuthLedgerEventActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('rejects unknown auth event action names', () => {
    expect(AuthLedgerEventActionSchema.safeParse('USER_DEACTIVATED').success).toBe(false);
  });

  it('validates auth ledger event payload action through schema', () => {
    const parsed = AuthLedgerEventSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'admin',
      subjectType: 'auth',
      subjectId: 'admin',
      payload: {
        action: AuthLedgerEventAction.LOGIN_SUCCESS,
        username: 'admin',
      },
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'req-1',
        payloadHash: 'a'.repeat(64),
        eventHash: 'b'.repeat(64),
        chainSequence: 1,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    });

    expect(parsed.success).toBe(true);
  });
});
