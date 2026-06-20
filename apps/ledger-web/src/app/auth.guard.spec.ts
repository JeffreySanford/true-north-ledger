/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { appRoutes } from './app.routes';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

const testBedPlatform = TestBed as unknown as { platform?: unknown };
if (!testBedPlatform.platform) {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

const createRouteSnapshot = (data: Record<string, unknown> = {}): ActivatedRouteSnapshot =>
  ({ data } as unknown as ActivatedRouteSnapshot);

const createStateSnapshot = (url: string): RouterStateSnapshot => ({ url } as RouterStateSnapshot);

describe('authGuard', () => {
  let mockAuthService: Partial<AuthService>;
  let router: Router;
  let isAuthenticated = false;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockAuthService = {
      get isAuthenticated() {
        return isAuthenticated;
      },
      setRedirectUrl: vi.fn(),
      hasPermission: vi.fn(() => true),
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

  it('should redirect unauthenticated user to login and preserve intended URL', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(createRouteSnapshot(), createStateSnapshot('/dashboard')));

    expect(result).toBe(false);
    expect(mockAuthService.setRedirectUrl).toHaveBeenCalledWith('/dashboard');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should allow authenticated user to access route', () => {
    isAuthenticated = true;
    const result = TestBed.runInInjectionContext(() => authGuard(createRouteSnapshot(), createStateSnapshot('/dashboard')));

    expect(result).toBe(true);
  });

  it('should allow authenticated user with required permissions to access route', () => {
    isAuthenticated = true;
    (mockAuthService.hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(createRouteSnapshot({ requiredPermissions: ['settings.read'] }), createStateSnapshot('/settings')),
    );

    expect(result).toBe(true);
  });

  it('should deny access when required permissions are missing', () => {
    isAuthenticated = true;
    (mockAuthService.hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(createRouteSnapshot({ requiredPermissions: ['admin'] }), createStateSnapshot('/settings')),
    );

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('should deny access for unsupported surface metadata', () => {
    isAuthenticated = true;
    const result = TestBed.runInInjectionContext(() =>
      authGuard(createRouteSnapshot({ surface: 'watch' }), createStateSnapshot('/watch')),
    );

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('should allow authenticated user on tablet surface when permissions are satisfied', () => {
    isAuthenticated = true;
    (mockAuthService.hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(
        createRouteSnapshot({ requiredPermissions: ['devices.read'], surface: 'tablet' }),
        createStateSnapshot('/tablet/receiving'),
      ),
    );

    expect(result).toBe(true);
  });

  it('should allow authenticated user on mobile surface when permissions are satisfied', () => {
    isAuthenticated = true;
    (mockAuthService.hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(
        createRouteSnapshot({ requiredPermissions: ['proof.read'], surface: 'mobile' }),
        createStateSnapshot('/mobile/scan'),
      ),
    );

    expect(result).toBe(true);
  });

  it('enforces the declared permission matrix for every secured Sprint route', () => {
    isAuthenticated = true;
    const securedRoutes = appRoutes.filter((route) => route.canActivate?.includes(authGuard));

    for (const route of securedRoutes) {
      const routeData = route.data as { requiredPermissions?: string[]; surface?: string };
      const requiredPermissions = routeData.requiredPermissions ?? [];
      const url = `/${route.path ?? ''}`;

      const allowedPermissions = new Set(requiredPermissions);
      (mockAuthService.hasPermission as ReturnType<typeof vi.fn>).mockImplementation((permission: string) =>
        allowedPermissions.has(permission),
      );
      vi.mocked(router.navigate).mockClear();

      const allowed = TestBed.runInInjectionContext(() =>
        authGuard(createRouteSnapshot(routeData), createStateSnapshot(url)),
      );

      expect(allowed, `${url} should allow users with ${requiredPermissions.join(', ')}`).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();

      if (requiredPermissions.length === 0) {
        continue;
      }

      allowedPermissions.delete(requiredPermissions[0]);
      vi.mocked(router.navigate).mockClear();

      const denied = TestBed.runInInjectionContext(() =>
        authGuard(createRouteSnapshot(routeData), createStateSnapshot(url)),
      );

      expect(denied, `${url} should deny users missing ${requiredPermissions[0]}`).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/unauthorized']);
    }
  });
});
