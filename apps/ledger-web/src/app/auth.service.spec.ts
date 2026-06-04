/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

const testBedPlatform = TestBed as unknown as { platform?: unknown };
if (!testBedPlatform.platform) {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tnl.disableAutoAuth', 'true');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    sessionStorage.clear();
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function createJwtWithExpiry(expiryEpochSeconds: number): string {
    const encode = (value: unknown): string => {
      const json = JSON.stringify(value);
      const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return base64;
    };

    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ exp: expiryEpochSeconds, iat: expiryEpochSeconds - 60, sub: 'admin' });
    return `${header}.${payload}.signature`;
  }

  it('should not create a static development session without a stored login', () => {
    expect(service.isAuthenticated).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('tnl.authToken')).toBeNull();
    expect(localStorage.getItem('tnl.refreshToken')).toBeNull();
  });

  it('should save tokens and user data after login', () => {
    const loginResponse = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    service.setRememberSession(true);
    service.login({ username: 'admin', password: 'admin' }).subscribe((user) => {
      expect(user.username).toBe('admin');
      expect(service.isAuthenticated).toBe(true);
      expect(localStorage.getItem('tnl.authToken')).toBe(loginResponse.accessToken);
      expect(localStorage.getItem('tnl.refreshToken')).toBe(loginResponse.refreshToken);
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(loginResponse);
  });

  it('stores session in sessionStorage when remember session is disabled', () => {
    const loginResponse = {
      accessToken: 'session-access-token',
      refreshToken: 'session-refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    service.setRememberSession(false);
    service.login({ username: 'admin', password: 'admin' }).subscribe();

    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(loginResponse);

    expect(localStorage.getItem('tnl.authToken')).toBeNull();
    expect(localStorage.getItem('tnl.authUser')).toBeNull();
    expect(sessionStorage.getItem('tnl.authToken')).toBe('session-access-token');
    expect(sessionStorage.getItem('tnl.authUser')).toContain('admin');
  });

  it('defaults to sessionStorage when remember-session preference is unset', () => {
    const loginResponse = {
      accessToken: 'default-session-access-token',
      refreshToken: 'default-session-refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    localStorage.removeItem('tnl.rememberSession');
    service.login({ username: 'admin', password: 'admin' }).subscribe();

    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(loginResponse);

    expect(localStorage.getItem('tnl.authToken')).toBeNull();
    expect(sessionStorage.getItem('tnl.authToken')).toBe('default-session-access-token');
  });

  it('should surface login errors from the API', async () => {
    const loginError = { message: 'Invalid credentials' };
    const result = new Promise<void>((resolve, reject) => {
      service.login({ username: 'admin', password: 'wrong' }).subscribe({
        next: () => reject(new Error('Expected login to fail')),
        error: (error: Error) => {
          expect(error.message).toBe('Invalid credentials');
          resolve();
        },
      });
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(loginError, { status: 401, statusText: 'Unauthorized' });
    await result;
  });

  it('should fail refresh when refresh token is missing', async () => {
    localStorage.removeItem('tnl.refreshToken');
    await new Promise<void>((resolve, reject) => {
      service.refresh().subscribe({
        next: () => reject(new Error('Expected refresh to fail')),
        error: (error: Error) => {
          expect(error.message).toBe('Refresh token not found');
          resolve();
        },
      });
    });
  });

  it('should fail logout when refresh token is missing', async () => {
    localStorage.removeItem('tnl.refreshToken');
    await new Promise<void>((resolve, reject) => {
      service.logout().subscribe({
        next: () => reject(new Error('Expected logout to fail')),
        error: (error: Error) => {
          expect(error.message).toBe('No refresh token available');
          resolve();
        },
      });
    });
  });

  it('should persist and clear redirect URL', () => {
    service.setRedirectUrl('/dashboard');
    expect(service.getRedirectUrl()).toBe('/dashboard');
    service.clearRedirectUrl();
    expect(service.getRedirectUrl()).toBeNull();
  });

  it('should expose current user and permission helpers', () => {
    const loginResponse = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(loginResponse);

    expect(service.getCurrentUser()).toEqual(loginResponse.user);
    expect(service.hasPermission('read')).toBe(true);
    expect(service.hasPermission('write')).toBe(false);
  });

  it('should return auth headers when an access token is present', () => {
    localStorage.setItem('tnl.authToken', 'access-token');

    expect(service.authHeaders()).toEqual({ Authorization: 'Bearer access-token' });
  });

  it('should return empty auth headers when no access token is present', () => {
    expect(service.authHeaders()).toEqual({});
  });

  it('should emit authenticated state through isAuthenticated$', () => {
    const loginResponse = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    const authStates: boolean[] = [];
    service.isAuthenticated$.subscribe((value) => authStates.push(value));

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(loginResponse);

    expect(authStates).toEqual([false, true]);
  });

  it('should clear stored session on logout', () => {
    localStorage.setItem('tnl.authToken', 'access-token');
    localStorage.setItem('tnl.refreshToken', 'refresh-token');
    localStorage.setItem('tnl.authUser', JSON.stringify({ userId: 'admin', username: 'admin' }));

    service.logout().subscribe({
      next: () => {
        expect(localStorage.getItem('tnl.authToken')).toBeNull();
        expect(localStorage.getItem('tnl.refreshToken')).toBeNull();
        expect(localStorage.getItem('tnl.authUser')).toBeNull();
      },
    });

    const req = httpMock.expectOne('/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-token' });
    req.flush(null);
  });

  it('should refresh tokens and user session', () => {
    service.setRememberSession(true);
    localStorage.setItem('tnl.refreshToken', 'refresh-token');

    const refreshResponse = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    service.refresh().subscribe((user) => {
      expect(user.username).toBe('admin');
      expect(service.isAuthenticated).toBe(true);
      expect(localStorage.getItem('tnl.authToken')).toBe(refreshResponse.accessToken);
      expect(localStorage.getItem('tnl.refreshToken')).toBe(refreshResponse.refreshToken);
    });

    const req = httpMock.expectOne('/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-token' });
    req.flush(refreshResponse);
  });

  it('should automatically refresh shortly before token expiration', () => {
    service.setRememberSession(true);
    const expSeconds = Math.floor((Date.now() + 35_000) / 1000);
    const loginResponse = {
      accessToken: createJwtWithExpiry(expSeconds),
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    const refreshResponse = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: loginResponse.user,
    };

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(loginResponse);

    vi.advanceTimersByTime(6_000);

    const refreshReq = httpMock.expectOne('/api/v1/auth/refresh');
    expect(refreshReq.request.method).toBe('POST');
    refreshReq.flush(refreshResponse);

    expect(localStorage.getItem('tnl.authToken')).toBe('new-access-token');
    expect(localStorage.getItem('tnl.refreshToken')).toBe('new-refresh-token');
  });

  it('should clear session when automatic refresh fails', () => {
    service.setRememberSession(true);
    const expSeconds = Math.floor((Date.now() + 35_000) / 1000);
    const loginResponse = {
      accessToken: createJwtWithExpiry(expSeconds),
      refreshToken: 'refresh-token',
      user: {
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['admin', 'read'],
      },
    };

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(loginResponse);

    vi.advanceTimersByTime(6_000);

    const refreshReq = httpMock.expectOne('/api/v1/auth/refresh');
    refreshReq.flush({ message: 'Session expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem('tnl.authToken')).toBeNull();
    expect(localStorage.getItem('tnl.refreshToken')).toBeNull();
    expect(sessionStorage.getItem('tnl.authToken')).toBeNull();
    expect(sessionStorage.getItem('tnl.refreshToken')).toBeNull();
    expect(service.getCurrentUser()).toBeNull();
  });
});
