import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { App } from './app';
import { AuthService, AuthUser } from './auth.service';

describe('App', () => {
  const user: AuthUser = {
    userId: 'admin-user',
    username: 'Admin User',
    actorType: 'user',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['ledger.read', 'settings.read'],
  };
  let authUser$: BehaviorSubject<AuthUser | null>;
  let allowedPermissions: Set<string>;
  let logoutMock: ReturnType<typeof vi.fn>;
  let httpGetMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    authUser$ = new BehaviorSubject<AuthUser | null>(null);
    allowedPermissions = new Set<string>();
    logoutMock = vi.fn(() => of(undefined));
    httpGetMock = vi.fn(() => of({ orders: [], total: 7, page: 1, pageSize: 1 }));

    await TestBed.configureTestingModule({
      declarations: [App],
      imports: [CommonModule, RouterModule.forRoot([])],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            currentUser$: authUser$.asObservable(),
            get isAuthenticated() {
              return authUser$.value !== null;
            },
            hasPermission: (permission: string) => allowedPermissions.has(permission),
            authHeaders: () => ({ Authorization: 'Bearer test-token' }),
            logout: logoutMock,
          },
        },
        {
          provide: HttpClient,
          useValue: {
            get: httpGetMock,
          },
        },
      ],
    }).compileComponents();
  });

  it('should render the shell navigation and app title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="app-nav"]')).toBeTruthy();
    expect(compiled.textContent).toContain('True North Ledger');
  });

  it('should render only navigation allowed by user permissions', async () => {
    authUser$.next(user);
    allowedPermissions = new Set(user.permissions);

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('[data-testid="app-nav"]') as HTMLElement;

    expect(nav.textContent).toContain('Dashboard');
    expect(nav.textContent).toContain('Ledger Events');
    expect(nav.textContent).toContain('Settings');
    expect(nav.textContent).not.toContain('Devices');
    expect(nav.textContent).not.toContain('Tablet Receiving');
    expect(nav.textContent).not.toContain('Mobile Scan');
    expect(nav.textContent).not.toContain('Proofs');
  });

  it('should expose tablet and mobile navigation links only when matching permissions exist', async () => {
    authUser$.next({
      ...user,
      permissions: ['devices.read'],
    });
    allowedPermissions = new Set(['devices.read']);

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('[data-testid="app-nav"]') as HTMLElement;

    expect(nav.textContent).toContain('Devices');
    expect(nav.textContent).toContain('Tablet Receiving');
    expect(nav.textContent).not.toContain('Mobile Scan');
    expect(nav.textContent).not.toContain('Proofs');
  });

  it('should render secure session state and user initials', async () => {
    authUser$.next(user);
    allowedPermissions = new Set(user.permissions);

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const session = fixture.nativeElement.querySelector('[data-testid="secure-session"]') as HTMLElement;

    expect(session.textContent).toContain('AU');
    expect(session.textContent).toContain('Welcome, Admin User');
  });

  it('renders the orders navigation count badge from the orders API', async () => {
    authUser$.next({
      ...user,
      permissions: ['orders.read'],
    });
    allowedPermissions = new Set(['orders.read']);

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-testid="orders-nav-badge"]') as HTMLElement;

    expect(httpGetMock).toHaveBeenCalledWith(
      '/api/v1/orders',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(badge.textContent?.trim()).toBe('7');
  });

  it('falls back to question-mark initials for blank usernames', () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance as unknown as { userInitials: (username: string) => string };

    expect(component.userInitials('   ')).toBe('?');
    expect(component.userInitials('single')).toBe('SI');
    expect(component.userInitials('Admin User')).toBe('AU');
  });

  it('navigates to login after logout succeeds or fails', () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance as unknown as { logout: () => void };

    component.logout();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);

    navigateSpy.mockClear();
    logoutMock.mockReturnValueOnce(throwError(() => new Error('logout failed')));

    component.logout();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});
