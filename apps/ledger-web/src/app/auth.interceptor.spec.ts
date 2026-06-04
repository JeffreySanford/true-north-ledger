/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const testBedPlatform = TestBed as unknown as { platform?: unknown };
if (!testBedPlatform.platform) {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

describe('authInterceptor', () => {
  let mockAuthService: Partial<AuthService>;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockAuthService = {
      get accessToken() {
        return localStorage.getItem('tnl.authToken');
      },
      clearSession: vi.fn(),
      refresh: vi.fn().mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
      ),
    } as Partial<AuthService>;

    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    });

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should attach Authorization header for protected requests', async () => {
    localStorage.setItem('tnl.authToken', 'test-token');
    const request = new HttpRequest('GET', '/api/v1/ledger/events');
    const next: HttpHandlerFn = (req: HttpRequest<unknown>) => {
      expect(req.headers.get('Authorization')).toBe('Bearer test-token');
      return of(new HttpResponse({ status: 200 }));
    };

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });
  });

  it('should not attach Authorization header for auth endpoints', async () => {
    localStorage.setItem('tnl.authToken', 'test-token');
    const request = new HttpRequest('POST', '/api/v1/auth/login', {});
    const next: HttpHandlerFn = (req: HttpRequest<unknown>) => {
      expect(req.headers.get('Authorization')).toBeNull();
      return of(new HttpResponse({ status: 200 }));
    };

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });
  });

  it('should redirect to login on 401 response for auth endpoints', async () => {
    localStorage.setItem('tnl.authToken', 'test-token');
    const request = new HttpRequest('POST', '/api/v1/auth/login', {});
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => reject(new Error('Expected request to fail')),
        error: (error) => {
          expect(error).toBeInstanceOf(HttpErrorResponse);
          expect(router.navigate).toHaveBeenCalledWith(['/login']);
          resolve();
        },
      });
    });
  });

  it('should refresh token and retry original request on 401 response', async () => {
    localStorage.setItem('tnl.authToken', 'expired-token');
    mockAuthService.refresh = vi.fn().mockImplementation(() => {
      localStorage.setItem('tnl.authToken', 'refreshed-token');
      return of({
        userId: 'admin',
        username: 'admin',
        actorType: 'user' as const,
        tenantId: '00000000-0000-0000-0000-000000000000',
        permissions: ['ledger.read'],
      });
    });

    const request = new HttpRequest('GET', '/api/v1/ledger/events');
    const next = vi.fn()
      .mockImplementationOnce(() => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })))
      .mockImplementationOnce((req: HttpRequest<unknown>) => {
        expect(req.headers.get('Authorization')).toBe('Bearer refreshed-token');
        return of(new HttpResponse({ status: 200 }));
      });

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => {
          expect(mockAuthService.refresh).toHaveBeenCalled();
          expect(router.navigate).not.toHaveBeenCalled();
          resolve();
        },
        error: reject,
      });
    });
  });

  it('should redirect to login when refresh fails', async () => {
    localStorage.setItem('tnl.authToken', 'expired-token');
    mockAuthService.refresh = vi.fn().mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );

    const request = new HttpRequest('GET', '/api/v1/ledger/events');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => reject(new Error('Expected request to fail')),
        error: (error) => {
          expect(error).toBeInstanceOf(HttpErrorResponse);
          expect(mockAuthService.clearSession).toHaveBeenCalled();
          expect(router.navigate).toHaveBeenCalledWith(['/login']);
          resolve();
        },
      });
    });
  });

  it('should redirect to unauthorized page on 403 response', async () => {
    localStorage.setItem('tnl.authToken', 'test-token');
    const request = new HttpRequest('GET', '/api/v1/ledger/events');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }));

    await new Promise<void>((resolve, reject) => {
      TestBed.runInInjectionContext(() => authInterceptor(request, next)).subscribe({
        next: () => reject(new Error('Expected request to fail')),
        error: (error) => {
          expect(error).toBeInstanceOf(HttpErrorResponse);
          expect(router.navigate).toHaveBeenCalledWith(['/unauthorized']);
          resolve();
        },
      });
    });
  });
});
