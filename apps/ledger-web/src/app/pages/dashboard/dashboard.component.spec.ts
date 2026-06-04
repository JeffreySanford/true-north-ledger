/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardModule } from './dashboard.module';
import { AuthService, AuthUser } from '../../auth.service';

describe('DashboardComponent', () => {
  let authUser$: BehaviorSubject<AuthUser | null>;

  beforeEach(async () => {
    authUser$ = new BehaviorSubject<AuthUser | null>(null);

    await TestBed.configureTestingModule({
      imports: [DashboardModule],
      providers: [
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            currentUser$: authUser$.asObservable(),
            get isAuthenticated() {
              return authUser$.value !== null;
            },
            hasPermission: (permission: string) => authUser$.value?.permissions.includes(permission) ?? false,
            logout: () => of(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders administrator role icon and complete mission state for role managers', async () => {
    authUser$.next({
      userId: 'admin',
      username: 'admin-user',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['admin', 'ledger.read', 'roles.manage'],
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const roleIcon = root.querySelector('[data-testid="role-aware-icon"]') as HTMLElement;

    expect(roleIcon).toBeTruthy();
    expect(roleIcon.getAttribute('aria-label')).toBe('Role icon: admin_panel_settings');
    expect(roleIcon.textContent).toContain('A');
    expect(root.textContent).toContain('Role profile');
    expect(root.textContent).toContain('Administrator');
    expect(root.textContent).toContain('Complete');
    expect(root.textContent).toContain('Derived from authenticated server state for admin-user');
  });

  it('renders operator role icon and ready mission state when read access is present', async () => {
    authUser$.next({
      userId: 'operator',
      username: 'operator-user',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['ledger.read'],
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const roleIcon = root.querySelector('[data-testid="role-aware-icon"]') as HTMLElement;

    expect(roleIcon.getAttribute('aria-label')).toBe('Role icon: inventory_2');
    expect(roleIcon.textContent).toContain('O');
    expect(root.textContent).toContain('Operator');
    expect(root.textContent).toContain('Ready');
    expect(root.textContent).toContain('Derived from authenticated server state for operator-user');
  });

  it('renders guest role state while authentication is pending', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance as unknown as {
      roleLabel: (user: AuthUser | null) => string;
      roleIconName: (user: AuthUser | null) => string;
      roleIconGlyph: (user: AuthUser | null) => string;
      missionState: (user: AuthUser | null) => string;
      missionSourceText: (user: AuthUser | null) => string;
    };

    expect(component.roleLabel(null)).toBe('Guest view');
    expect(component.roleIconName(null)).toBe('person_outline');
    expect(component.roleIconGlyph(null)).toBe('G');
    expect(component.missionState(null)).toBe('pending');
    expect(component.missionSourceText(null)).toBe('Waiting for authenticated server state');
    expect(root.textContent).toContain('Pending');
    expect(root.textContent).toContain('Waiting for authenticated server state');
  });
});
