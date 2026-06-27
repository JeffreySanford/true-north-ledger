/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardModule } from './dashboard.module';
import { AuthService, AuthUser } from '../../auth.service';
import {
  NotificationService,
  type LedgerNotification,
  type NotificationConnectionState,
} from '../../notification.service';
import {
  APPROVED_DEMO_OPERATIONS_SNAPSHOT,
  DashboardOperationsService,
  type DashboardOperationsSnapshot,
} from './dashboard-operations.service';

describe('DashboardComponent', () => {
  let authUser$: BehaviorSubject<AuthUser | null>;
  let notificationState$: BehaviorSubject<NotificationConnectionState>;
  let notifications$: BehaviorSubject<LedgerNotification>;
  let notificationService: {
    connectionState$: BehaviorSubject<NotificationConnectionState>;
    notifications$: BehaviorSubject<LedgerNotification>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  let dashboardOperationsSnapshot: DashboardOperationsSnapshot;
  let dashboardOperationsService: {
    fetchSnapshot: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authUser$ = new BehaviorSubject<AuthUser | null>(null);
    notificationState$ =
      new BehaviorSubject<NotificationConnectionState>('disconnected');
    notifications$ = new BehaviorSubject<LedgerNotification>(
      buildNotification('initial-event'),
    );
    notificationService = {
      connectionState$: notificationState$,
      notifications$,
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribe: vi.fn(() =>
        of({
          subscribed: true,
          rooms: ['tenant:00000000-0000-0000-0000-000000000000'],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
      unsubscribe: vi.fn(() =>
        of({
          subscribed: false,
          rooms: ['tenant:00000000-0000-0000-0000-000000000000'],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
    };
    dashboardOperationsSnapshot = {
      activeConnections: 3,
      openAnomalies: 2,
      deviceHeartbeat: {
        total: 4,
        online: 3,
        missing: 1,
      },
      source: 'api',
    };
    dashboardOperationsService = {
      fetchSnapshot: vi.fn(() => of(dashboardOperationsSnapshot)),
    };

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
        {
          provide: NotificationService,
          useValue: notificationService,
        },
        {
          provide: DashboardOperationsService,
          useValue: dashboardOperationsService,
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

  it('renders live operations state from the notification service', async () => {
    notificationState$.next('connected');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;

    expect(notificationService.connect).toHaveBeenCalledOnce();
    expect(notificationService.subscribe).toHaveBeenCalledWith({
      eventType: 'LEDGER_EVENT',
    });
    expect(root.querySelector('[data-testid="live-operations-board"]')?.textContent)
      .toContain('Live operations');
    expect(root.querySelector('[data-testid="readiness-score"]')?.textContent)
      .toContain('100 readiness points');
    expect(root.querySelector('[data-testid="live-event-count"]')?.textContent)
      .toContain('1 live ledger event received this session.');
    expect(root.querySelector('[data-testid="live-event-feed"]')?.textContent)
      .toContain('LEDGER_EVENT_CREATED');
    expect(root.textContent).toContain('order / initial-event');
    expect(dashboardOperationsService.fetchSnapshot).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-testid="live-operations-signals"]')?.textContent)
      .toContain('Live API state');
    expect(root.querySelector('[data-testid="live-operations-signals"]')?.textContent)
      .toContain('3 active connections');
    expect(root.querySelector('[data-testid="live-operations-signals"]')?.textContent)
      .toContain('2 open anomalies');
    expect(root.querySelector('[data-testid="live-operations-signals"]')?.textContent)
      .toContain('3 online / 1 missing heartbeat');
  });

  it('labels approved fixture demo mode when live operations API state is unavailable', async () => {
    dashboardOperationsService.fetchSnapshot.mockReturnValueOnce(
      of(APPROVED_DEMO_OPERATIONS_SNAPSHOT),
    );
    notificationState$.next('connected');

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const signals = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="live-operations-signals"]',
    ) as HTMLElement;

    expect(signals.textContent).toContain(
      'Approved fixture fallback until API state is available',
    );
    expect(signals.textContent).toContain('0 active connections');
    expect(signals.textContent).toContain('0 open anomalies');
    expect(signals.textContent).toContain('No devices registered');
  });

  it('maps reconnecting state and disconnects on destroy', async () => {
    notificationState$.next('reconnecting');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      connectionStateForPrimitive: (
        state: NotificationConnectionState,
      ) => string;
      readinessScore: (state: NotificationConnectionState) => number;
      notificationDetail: (state: NotificationConnectionState) => string;
    };

    expect(component.connectionStateForPrimitive('reconnecting')).toBe('connecting');
    expect(component.readinessScore('reconnecting')).toBe(50);
    expect(component.notificationDetail('failed')).toBe('Live ledger feed unavailable');

    fixture.destroy();

    expect(notificationService.unsubscribe).toHaveBeenCalledWith({
      eventType: 'LEDGER_EVENT',
    });
    expect(notificationService.disconnect).toHaveBeenCalledOnce();
  });

  it('renders live operations connection status labels for all socket states', async () => {
    const expectedStates: Array<{
      state: NotificationConnectionState;
      label: string;
      detail: string;
    }> = [
      {
        state: 'connected',
        label: 'Connected',
        detail: 'Subscribed to tenant ledger events',
      },
      {
        state: 'reconnecting',
        label: 'Connecting',
        detail: 'Reconnecting to live ledger feed',
      },
      {
        state: 'disconnected',
        label: 'Disconnected',
        detail: 'Live ledger feed waiting for connection',
      },
      {
        state: 'failed',
        label: 'Failed',
        detail: 'Live ledger feed unavailable',
      },
    ];

    for (const expected of expectedStates) {
      notificationState$.next(expected.state);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const connectionStatus = (
        fixture.nativeElement as HTMLElement
      ).querySelector(
        '[data-testid="live-operations-board"] [data-testid="connection-status"]',
      ) as HTMLElement;

      expect(connectionStatus.textContent).toContain('Ledger feed');
      expect(connectionStatus.textContent).toContain(expected.label);
      expect(connectionStatus.textContent).toContain(expected.detail);
      expect(connectionStatus.getAttribute('aria-label')).toContain(
        `Ledger feed: ${expected.label}. ${expected.detail}`,
      );

      fixture.destroy();
    }
  });

  it('prepends new live events while reduced-motion timings are zeroed', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    notificationState$.next('connected');

    try {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      notifications$.next(buildNotification('reduced-motion-event'));
      fixture.detectChanges();

      const component = fixture.componentInstance as unknown as {
        motionTimings: { highlightDuration: string };
      };
      const feedText = (
        fixture.nativeElement as HTMLElement
      ).querySelector('[data-testid="live-event-feed"]')?.textContent;

      expect(component.motionTimings.highlightDuration).toBe('0ms');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="live-event-count"]',
        )?.textContent,
      ).toContain('2 live ledger events received this session.');
      expect(feedText).toContain('order / reduced-motion-event');
      expect(feedText).toContain('order / initial-event');

      fixture.destroy();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  function buildNotification(subjectId: string): LedgerNotification {
    return {
      event: 'LEDGER_EVENT_CREATED',
      priority: 'high',
      category: 'ledger',
      occurredAt: '2026-06-25T12:00:00.000Z',
      ledgerEvent: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'LEDGER_EVENT',
        actorType: 'user',
        actorId: 'admin',
        subjectType: 'order',
        subjectId,
        payload: { action: 'created' },
        metadata: {
          tenantId: '00000000-0000-0000-0000-000000000000',
          requestId: 'request-1',
          correlationId: 'correlation-1',
          payloadHash: 'a'.repeat(64),
          eventHash: 'b'.repeat(64),
          chainSequence: 1,
          result: 'accepted',
          timestamp: '2026-06-25T12:00:00.000Z',
        },
        createdAt: '2026-06-25T12:00:00.000Z',
      },
    };
  }
});
