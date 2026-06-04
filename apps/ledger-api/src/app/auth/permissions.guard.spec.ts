import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  const reflector = { getAllAndOverride: jest.fn() };
  const ledgerEventsService = { appendEvent: jest.fn().mockReturnValue(of({})) };
  const authService = { resolvePermissionsForActor: jest.fn(), isActorActive: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    authService.resolvePermissionsForActor.mockImplementation((actor: { permissions?: string[] }) => actor.permissions ?? []);
    authService.isActorActive.mockReturnValue(true);
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      ledgerEventsService as typeof ledgerEventsService,
      authService as unknown as AuthService,
    );
  });

  function createContext(userPermissions: string[] = []): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { permissions: userPermissions, userId: 'test-user', actorType: 'user', tenantId: 'tenant-123' },
          url: '/api/v1/ledger/events',
          headers: { 'user-agent': 'jest', 'x-correlation-id': 'corr-1' },
          ip: '127.0.0.1',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows requests when no permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext(['read']))).toBe(true);
    expect(authService.isActorActive).not.toHaveBeenCalled();
  });

  it('allows requests when the user has all required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['read', 'write']);

    expect(guard.canActivate(createContext(['read', 'write']))).toBe(true);
  });

  it('allows requests when the user has admin permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['read', 'write']);

    expect(guard.canActivate(createContext(['admin']))).toBe(true);
  });

  it('allows requests when role resolution provides required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['ledger.audit']);
    authService.resolvePermissionsForActor.mockReturnValue(['ledger.audit']);

    expect(guard.canActivate(createContext([]))).toBe(true);
    expect(authService.resolvePermissionsForActor).toHaveBeenCalled();
  });

  it('allows requests when the user has multiple required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['read', 'write']);

    expect(guard.canActivate(createContext(['read', 'write', 'audit']))).toBe(true);
  });

  it('throws ForbiddenException when a required permission is missing from multiple requirements', () => {
    reflector.getAllAndOverride.mockReturnValue(['read', 'write', 'audit']);

    expect(() => guard.canActivate(createContext(['read', 'write']))).toThrow(ForbiddenException);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEDGER_EVENT',
        subjectType: 'auth',
        payload: expect.objectContaining({
          action: 'PERMISSION_DENIED',
          requiredPermissions: ['read', 'write', 'audit'],
          actualPermissions: ['read', 'write'],
        }),
      }),
      expect.objectContaining({
        userId: 'test-user',
        actorType: 'user',
        tenantId: 'tenant-123',
      }),
      'tenant-123',
      expect.any(Object),
    );
  });

  it('throws ForbiddenException when a required permission is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['read', 'write']);

    expect(() => guard.canActivate(createContext(['read']))).toThrow(ForbiddenException);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalled();
  });

  it('throws ForbiddenException when user is deactivated', () => {
    reflector.getAllAndOverride.mockReturnValue(['read']);
    authService.isActorActive.mockReturnValue(false);

    expect(() => guard.canActivate(createContext(['read']))).toThrow('User is deactivated');
    expect(ledgerEventsService.appendEvent).toHaveBeenCalled();
  });
});
