import { of } from 'rxjs';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RateLimitGuard } from './rate-limit.guard';
import { LedgerEventsService } from '../ledger-events/ledger-events.service';
import { Reflector } from '@nestjs/core';
import { getStorageToken } from '@nestjs/throttler';

const loginResponse = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: {
    userId: 'admin',
    username: 'admin',
    actorType: 'user',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['admin'],
  },
};

const refreshResponse = {
  accessToken: 'refreshed-access',
  refreshToken: 'refreshed-refresh',
  user: {
    userId: 'admin',
    username: 'admin',
    actorType: 'user',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['admin'],
  },
};

const mockAuthService = {
  login: jest.fn().mockReturnValue(of(loginResponse)),
  refresh: jest.fn().mockReturnValue(of(refreshResponse)),
  logout: jest.fn().mockReturnValue(of(void 0)),
  createServiceToken: jest.fn().mockReturnValue(of({
    id: 'token-id',
    name: 'integration-service',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['read'],
    token: 'raw-token',
    createdAt: new Date().toISOString(),
    revoked: false,
  })),
  revokeServiceToken: jest.fn().mockReturnValue(of(void 0)),
  assignUserRoles: jest.fn().mockReturnValue(of({
    userId: 'user-ops-001',
    username: 'ops.manager',
    tenantId: '00000000-0000-0000-0000-000000000000',
    roles: ['operations_manager'],
    permissions: ['ledger.read', 'orders.read'],
    active: true,
    updatedAt: new Date().toISOString(),
  })),
  deactivateUser: jest.fn().mockReturnValue(of({
    userId: 'user-ops-001',
    username: 'ops.manager',
    tenantId: '00000000-0000-0000-0000-000000000000',
    active: false,
    updatedAt: new Date().toISOString(),
    reason: 'Security hold',
  })),
};

describe('AuthController', () => {
  let controller: AuthController;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    testingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        RateLimitGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn(() => undefined) } },
        { provide: LedgerEventsService, useValue: { appendEvent: jest.fn() } },
        {
          provide: getStorageToken(),
          useValue: {
            increment: jest.fn().mockResolvedValue({
              totalHits: 1,
              timeToExpire: 1,
              isBlocked: false,
              timeToBlockExpire: 0,
            }),
          },
        },
      ],
    }).compile();

    controller = testingModule.get<AuthController>(AuthController);
  });

  afterEach(async () => {
    await testingModule?.close();
  });

  it('returns auth tokens on login', async () => {
    const result = await new Promise((resolve, reject) =>
      controller.login({ username: 'admin', password: 'admin' }, {
        user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest', 'x-correlation-id': 'corr-login' },
      }).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(result).toEqual(loginResponse);
    expect(mockAuthService.login).toHaveBeenCalledWith(
      { username: 'admin', password: 'admin' },
      { sourceIp: '127.0.0.1', userAgent: 'jest', correlationId: 'corr-login' },
    );
  });

  it('refreshes auth tokens', async () => {
    const result = await new Promise((resolve, reject) =>
      controller.refresh({ refreshToken: 'refresh' }, {
        user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
        ip: '127.0.0.2',
        headers: { 'user-agent': 'jest-refresh', 'x-correlation-id': 'corr-refresh' },
      }).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(result).toEqual(refreshResponse);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(
      'refresh',
      { sourceIp: '127.0.0.2', userAgent: 'jest-refresh', correlationId: 'corr-refresh' },
    );
  });

  it('logs out with a refresh token', async () => {
    await new Promise<void>((resolve, reject) =>
      controller.logout(
        { refreshToken: 'refresh' },
        {
          user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
          ip: '127.0.0.3',
          headers: { authorization: 'Bearer access' },
        },
      ).subscribe({
        next: () => resolve(),
        error: reject,
      }),
    );

    expect(mockAuthService.logout).toHaveBeenCalledWith(
      'refresh',
      'access',
      { sourceIp: '127.0.0.3', userAgent: undefined, correlationId: undefined },
    );
  });

  it('creates a service token with admin request body', async () => {
    const result = await new Promise((resolve, reject) =>
      controller.createServiceToken(
        { name: 'integration-service', permissions: ['read'] },
        {
          user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
          ip: '127.0.0.4',
          headers: { 'user-agent': 'jest-service-token', 'x-correlation-id': 'corr-service-token' },
        },
      ).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(result).toEqual({
      id: 'token-id',
      name: 'integration-service',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['read'],
      token: 'raw-token',
      createdAt: expect.any(String),
      revoked: false,
    });
    expect(mockAuthService.createServiceToken).toHaveBeenCalledWith(
      { name: 'integration-service', permissions: ['read'] },
      { sourceIp: '127.0.0.4', userAgent: 'jest-service-token', correlationId: 'corr-service-token' },
    );
  });

  it('revokes a service token by id', async () => {
    const tokenId = '550e8400-e29b-41d4-a716-446655440000';

    await new Promise<void>((resolve, reject) =>
      controller.revokeServiceToken(tokenId, {
        user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
        ip: '127.0.0.5',
        headers: { 'user-agent': 'jest-revoke', 'x-correlation-id': 'corr-revoke' },
      }).subscribe({
        next: () => resolve(),
        error: reject,
      }),
    );

    expect(mockAuthService.revokeServiceToken).toHaveBeenCalledWith(
      tokenId,
      { sourceIp: '127.0.0.5', userAgent: 'jest-revoke', correlationId: 'corr-revoke' },
    );
  });

  it('assigns user roles as admin', async () => {
    const result = await new Promise((resolve, reject) =>
      controller.assignUserRoles(
        'user-ops-001',
        { username: 'ops.manager', roles: ['operations_manager'] },
        { user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' } },
      ).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(result).toEqual(expect.objectContaining({
      userId: 'user-ops-001',
      roles: ['operations_manager'],
      active: true,
    }));
    expect(mockAuthService.assignUserRoles).toHaveBeenCalledWith(
      'user-ops-001',
      { username: 'ops.manager', roles: ['operations_manager'] },
      { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
    );
  });

  it('deactivates a user as admin', async () => {
    const result = await new Promise((resolve, reject) =>
      controller.deactivateUser(
        'user-ops-001',
        { reason: 'Security hold' },
        { user: { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' } },
      ).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(result).toEqual(expect.objectContaining({
      userId: 'user-ops-001',
      active: false,
      reason: 'Security hold',
    }));
    expect(mockAuthService.deactivateUser).toHaveBeenCalledWith(
      'user-ops-001',
      { reason: 'Security hold' },
      { userId: 'admin', actorType: 'user', tenantId: '00000000-0000-0000-0000-000000000000' },
    );
  });
});
