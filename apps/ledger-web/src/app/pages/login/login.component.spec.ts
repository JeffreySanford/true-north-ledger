/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LoginComponent } from './login.component';
import { AuthService, AuthUser } from '../../auth.service';

const testBedPlatform = TestBed as unknown as { platform?: unknown };
if (!testBedPlatform.platform) {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

describe('LoginComponent', () => {
  let component: LoginComponent;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    setRememberSession: ReturnType<typeof vi.fn>;
    getRedirectUrl: ReturnType<typeof vi.fn>;
    clearRedirectUrl: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
    navigateByUrl: ReturnType<typeof vi.fn>;
  };
  type LoginComponentTest = LoginComponent & {
    form: LoginComponent['form'];
    submit: LoginComponent['submit'];
    errorMessage: string;
    isSubmitting: boolean;
  };

  beforeEach(() => {
    authService = {
      login: vi.fn(),
      setRememberSession: vi.fn(),
      getRedirectUrl: vi.fn().mockReturnValue(null),
      clearRedirectUrl: vi.fn(),
    };
    router = { navigate: vi.fn(), navigateByUrl: vi.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });

    component = TestBed.runInInjectionContext(() => new LoginComponent());
  });

  it('shows validation error when form is empty', () => {
    const componentTest = component as LoginComponentTest;
    componentTest.submit();
    expect(componentTest.errorMessage).toBe('Please enter a username and password.');
  });

  it('submits credentials and navigates on success', () => {
    const componentTest = component as LoginComponentTest;
    const authUser: AuthUser = {
      userId: 'admin',
      username: 'admin',
      actorType: 'user' as const,
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['admin'],
    };
    authService.login.mockReturnValue(of(authUser));

    componentTest.form.setValue({ username: 'admin', password: 'admin', rememberMe: true });
    componentTest.submit();

    expect(authService.setRememberSession).toHaveBeenCalledWith(true);
    expect(authService.login).toHaveBeenCalledWith({ username: 'admin', password: 'admin' });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('clears the intended URL and navigates back to it after login', () => {
    const componentTest = component as LoginComponentTest;
    const authUser: AuthUser = {
      userId: 'admin',
      username: 'admin',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['ledger.read'],
    };
    authService.login.mockReturnValue(of(authUser));
    authService.getRedirectUrl.mockReturnValue('/orders');

    componentTest.form.setValue({ username: 'admin', password: 'admin', rememberMe: true });
    componentTest.submit();

    expect(authService.clearRedirectUrl).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/orders');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('sets loading state while login request is pending', () => {
    const componentTest = component as LoginComponentTest;
    authService.login.mockReturnValue({ subscribe: vi.fn() });

    componentTest.form.setValue({ username: 'admin', password: 'admin', rememberMe: true });
    componentTest.submit();

    expect(componentTest.isSubmitting).toBe(true);
    expect(componentTest.errorMessage).toBe('');
  });

  it('shows server return error message when login fails', () => {
    const componentTest = component as LoginComponentTest;
    authService.login.mockReturnValue(throwError(() => new Error('Invalid credentials')));

    componentTest.form.setValue({ username: 'admin', password: 'wrong', rememberMe: false });
    componentTest.submit();

    expect(componentTest.errorMessage).toBe('Invalid credentials');
    expect(componentTest.isSubmitting).toBe(false);
    expect(authService.setRememberSession).toHaveBeenCalledWith(false);
  });

  it('passes remember-session preference before login', () => {
    const componentTest = component as LoginComponentTest;
    authService.login.mockReturnValue(of({
      userId: 'admin',
      username: 'admin',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['admin'],
    } as AuthUser));

    componentTest.form.setValue({ username: 'admin', password: 'admin', rememberMe: false });
    componentTest.submit();

    expect(authService.setRememberSession).toHaveBeenCalledWith(false);
  });
});
