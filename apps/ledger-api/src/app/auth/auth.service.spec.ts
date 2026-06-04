import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { Observable, of } from 'rxjs';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { AuthService } from './auth.service';
import { LedgerEventsService } from '../ledger-events/ledger-events.service';
import { TokenBlacklistService } from './token-blacklist.service';

const ORIGINAL_ENV = process.env;

describe('AuthService', () => {
  let service: AuthService;
  let ledgerEventsService: LedgerEventsService;
  let testingModule: TestingModule;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      AUTH_USERNAME: 'test-user',
      AUTH_PASSWORD: 'test-password',
      AUTH_TENANT_ID: '00000000-0000-0000-0000-000000000000',
      JWT_SECRET: 'test-secret-000000000000000000000000000000',
      JWT_EXPIRATION: '1h',
      JWT_REFRESH_EXPIRATION: '1d',
    };

    const jwtSecret = process.env.JWT_SECRET ?? 'test-secret-000000000000000000000000000000';
    testingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1h' } })],
      providers: [
        AuthService,
        {
          provide: LedgerEventsService,
          useValue: {
            appendEvent: jest.fn().mockReturnValue(of({})),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            blacklistJti: jest.fn().mockResolvedValue(undefined),
            isJtiBlacklisted: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = testingModule.get<AuthService>(AuthService);
    ledgerEventsService = testingModule.get<LedgerEventsService>(LedgerEventsService);
  });

  afterEach(async () => {
    await testingModule?.close();
    process.env = ORIGINAL_ENV;
  });

  function awaitSingle<T>(source$: Observable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) =>
      source$.subscribe({
        next: resolve,
        error: reject,
      }),
    );
  }

  it('logs in with valid credentials and returns tokens', async () => {
    const response = await awaitSingle(service.login({ username: 'test-user', password: 'test-password' }));

    expect(response.user.username).toBe('test-user');
    expect(response.user.permissions).toEqual(expect.arrayContaining(['ledger.read', 'ledger.write', 'ledger.audit']));
    expect(response.accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    expect(response.refreshToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalled();
  });

  it('captures source IP, user agent, and correlation id metadata for login events', async () => {
    await awaitSingle(service.login(
      { username: 'test-user', password: 'test-password' },
      { sourceIp: '10.20.30.40', userAgent: 'jest-auth-service', correlationId: 'corr-login-metadata' },
    ));

    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: AuthLedgerEventAction.LOGIN_SUCCESS }),
      }),
      expect.objectContaining({ userId: 'admin', actorType: 'user' }),
      '00000000-0000-0000-0000-000000000000',
      expect.objectContaining({
        sourceIp: '10.20.30.40',
        userAgent: 'jest-auth-service',
        correlationId: 'corr-login-metadata',
      }),
    );
  });

  it('rejects login with bad credentials', async () => {
    await expect(
      new Promise((resolve, reject) =>
        service.login({ username: 'test-user', password: 'wrong' }).subscribe({
          next: resolve,
          error: reject,
        }),
      ),
    ).rejects.toThrow('Invalid username or password');

    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEDGER_EVENT',
        subjectType: 'auth',
        subjectId: 'test-user',
        payload: expect.objectContaining({ action: AuthLedgerEventAction.LOGIN_FAILED, username: 'test-user' }),
      }),
      expect.any(Object),
      '00000000-0000-0000-0000-000000000000',
      expect.any(Object),
    );
  });

  it('refreshes tokens with a valid refresh token', async () => {
    const loginResponse = await awaitSingle(service.login({ username: 'test-user', password: 'test-password' }));

    const refreshed = await awaitSingle(service.refresh(loginResponse.refreshToken));

    expect(refreshed.user.username).toBe('test-user');
    expect(refreshed.accessToken).not.toBe(loginResponse.accessToken);
    expect(refreshed.refreshToken).not.toBe(loginResponse.refreshToken);
  });

  it('captures source IP, user agent, and correlation id metadata for refresh events', async () => {
    const loginResponse = await awaitSingle(service.login({ username: 'test-user', password: 'test-password' }));

    await awaitSingle(service.refresh(loginResponse.refreshToken, {
      sourceIp: '10.20.30.41',
      userAgent: 'jest-auth-service-refresh',
      correlationId: 'corr-refresh-metadata',
    }));

    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: AuthLedgerEventAction.TOKEN_REFRESHED }),
      }),
      expect.objectContaining({ userId: 'admin', actorType: 'user' }),
      '00000000-0000-0000-0000-000000000000',
      expect.objectContaining({
        sourceIp: '10.20.30.41',
        userAgent: 'jest-auth-service-refresh',
        correlationId: 'corr-refresh-metadata',
      }),
    );
  });

  it('rotates refresh tokens and invalidates the previous refresh token', async () => {
    const loginResponse = await awaitSingle(service.login({ username: 'test-user', password: 'test-password' }));
    const refreshedOnce = await awaitSingle(service.refresh(loginResponse.refreshToken));

    await expect(
      new Promise((resolve, reject) =>
        service.refresh(loginResponse.refreshToken).subscribe({
          next: resolve,
          error: reject,
        }),
      ),
    ).rejects.toThrow('Refresh token is invalid or revoked');

    const refreshedTwice = await awaitSingle(service.refresh(refreshedOnce.refreshToken));
    expect(refreshedTwice.accessToken).not.toBe(refreshedOnce.accessToken);
  });

  it('revokes refresh token on logout', async () => {
    const loginResponse = await awaitSingle(service.login({ username: 'test-user', password: 'test-password' }));

    await new Promise<void>((resolve, reject) =>
      service.logout(loginResponse.refreshToken, loginResponse.accessToken).subscribe({
        next: () => resolve(),
        error: reject,
      }),
    );
    await expect(
      new Promise((resolve, reject) =>
        service.refresh(loginResponse.refreshToken).subscribe({
          next: resolve,
          error: reject,
        }),
      ),
    ).rejects.toThrow('Refresh token is invalid or revoked');

    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEDGER_EVENT',
        subjectType: 'auth',
        payload: expect.objectContaining({ action: AuthLedgerEventAction.LOGOUT }),
      }),
      expect.any(Object),
      '00000000-0000-0000-0000-000000000000',
      expect.any(Object),
    );
  });

  it('creates and revokes a service token', async () => {
    const createResponse = await awaitSingle(service.createServiceToken({
      name: 'integration-service',
      permissions: ['ledger.read'],
    }));

    expect(createResponse.id).toBeTruthy();
    expect(createResponse.token).toBeTruthy();
    expect(createResponse.permissions).toEqual(['ledger.read']);

    const verifiedUser = await service.verifyServiceToken(createResponse.token);
    expect(verifiedUser.actorType).toBe('service');
    expect(verifiedUser.permissions).toEqual(['ledger.read']);
    expect(verifiedUser.tenantId).toBe(process.env.AUTH_TENANT_ID);

    await new Promise<void>((resolve, reject) =>
      service.revokeServiceToken(createResponse.id).subscribe({
        next: () => resolve(),
        error: reject,
      }),
    );

    await expect(service.verifyServiceToken(createResponse.token)).rejects.toThrow('Invalid or revoked service token');
  });

  it('resolves permissions from assigned roles when actor permissions are empty', () => {
    const resolved = service.resolvePermissionsForActor({
      userId: 'auditor-user',
      roles: ['auditor'],
      permissions: [],
    });

    expect(resolved).toEqual(expect.arrayContaining(['ledger.read', 'ledger.audit', 'proof.read']));
    expect(resolved).not.toContain('users.manage');
  });

  it('assigns user roles and records role assignment audit event', async () => {
    const result = await awaitSingle(service.assignUserRoles(
      'ops-user-1',
      { username: 'ops.manager', roles: ['operations_manager', 'viewer'] },
      { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
    ));

    expect(result.roles).toEqual(['operations_manager', 'viewer']);
    expect(result.permissions).toEqual(expect.arrayContaining(['ledger.read', 'orders.read', 'shipping.read']));
    expect(result.active).toBe(true);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'ROLE_ASSIGNMENT_UPDATED',
          roles: ['operations_manager', 'viewer'],
        }),
      }),
      expect.objectContaining({ userId: 'admin' }),
      '00000000-0000-0000-0000-000000000000',
      expect.any(Object),
    );
  });

  it('deactivates user and blocks future active-state checks', async () => {
    const result = await awaitSingle(service.deactivateUser(
      'ops-user-1',
      { reason: 'Security hold' },
      { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
    ));

    expect(result).toEqual(expect.objectContaining({
      userId: 'ops-user-1',
      active: false,
      reason: 'Security hold',
    }));
    expect(service.isActorActive({ userId: 'ops-user-1', actorType: 'user' })).toBe(false);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: 'USER_DEACTIVATED' }),
      }),
      expect.objectContaining({ userId: 'admin' }),
      '00000000-0000-0000-0000-000000000000',
      expect.any(Object),
    );
  });

  it('rejects login for deactivated seeded user', async () => {
    await awaitSingle(service.deactivateUser(
      'admin',
      { reason: 'Access removed' },
      { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
    ));

    await expect(
      new Promise((resolve, reject) =>
        service.login({ username: 'test-user', password: 'test-password' }).subscribe({
          next: resolve,
          error: reject,
        }),
      ),
    ).rejects.toThrow('User is deactivated');
  });
});
