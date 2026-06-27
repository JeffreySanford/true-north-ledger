/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { VisualPrimitivesModule } from './shared/visual-primitives.module';
import {
  type LedgerNotification,
  type NotificationConnectionState,
  NotificationService,
} from './notification.service';
import { NotificationComponent } from './notification.component';

describe('NotificationComponent', () => {
  let fixture: ComponentFixture<NotificationComponent>;
  let notificationState$: BehaviorSubject<NotificationConnectionState>;
  let notifications$: Subject<LedgerNotification>;
  let notificationService: {
    connectionState$: BehaviorSubject<NotificationConnectionState>;
    notifications$: Subject<LedgerNotification>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    window.localStorage.removeItem('tnl.notificationSoundEnabled');
    notificationState$ = new BehaviorSubject<NotificationConnectionState>('connected');
    notifications$ = new Subject<LedgerNotification>();
    notificationService = {
      connectionState$: notificationState$,
      notifications$,
      connect: vi.fn(),
      disconnect: vi.fn(),
      retry: vi.fn(),
      subscribe: vi.fn(() =>
        of({
          subscribed: true,
          rooms: ['tenant:11111111-1111-4111-8111-111111111111:event_type:LEDGER_EVENT'],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
      unsubscribe: vi.fn(() =>
        of({
          subscribed: false,
          rooms: [],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [VisualPrimitivesModule],
      declarations: [NotificationComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: NotificationService,
          useValue: notificationService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationComponent);
    fixture.detectChanges();
    await settleNotificationComponent();
  });

  async function settleNotificationComponent(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('connects, subscribes, and renders each connection state label', async () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(notificationService.connect).toHaveBeenCalledOnce();
    expect(notificationService.subscribe).toHaveBeenCalledWith({ eventType: 'LEDGER_EVENT' });
    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Connected');
    expect(root.querySelector('[data-testid="notification-state"]')?.classList)
      .toContain('notification-center__state--connected');

    notificationState$.next('connecting');
    await settleNotificationComponent();
    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Connecting');
    expect(root.querySelector('[data-testid="notification-state"]')?.classList)
      .toContain('notification-center__state--connecting');

    notificationState$.next('reconnecting');
    await settleNotificationComponent();
    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Reconnecting');
    expect(root.querySelector('[data-testid="notification-state"]')?.classList)
      .toContain('notification-center__state--connecting');

    notificationState$.next('disconnected');
    await settleNotificationComponent();
    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Disconnected');
    expect(root.querySelector('[data-testid="notification-state"]')?.classList)
      .toContain('notification-center__state--disconnected');

    notificationState$.next('failed');
    await settleNotificationComponent();
    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Failed');
    expect(root.querySelector('[data-testid="notification-state"]')?.classList)
      .toContain('notification-center__state--disconnected');
  });

  it('shows unread badge, toast, and notification list entries', () => {
    notifications$.next(buildNotification('high-event', 'high'));
    notifications$.next(buildNotification('normal-event', 'normal'));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance as unknown as { togglePanel: () => void };
    component.togglePanel();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="notification-badge"]')?.textContent?.trim()).toBe('2');
    expect(root.querySelector('[data-testid="notification-toast"]')?.textContent).toContain('INVENTORY_SCANNED');
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('data-tone')).toBe('warning');
    expect(root.querySelector('[data-testid="notification-toast"]')?.classList)
      .toContain('notification-toast--warning');
    expect(root.querySelectorAll('[data-testid="notification-list-item"]')).toHaveLength(2);
    expect(Array.from(root.querySelectorAll('[data-testid="notification-severity-icon"]')).map((node) => node.textContent?.trim()))
      .toEqual(['notifications', 'priority_high']);
  });

  it('maps low, normal, and high priority notifications to green, yellow, and red toaster states', () => {
    const root = fixture.nativeElement as HTMLElement;

    notifications$.next(buildNotification('low-event', 'low'));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('data-tone')).toBe('success');
    expect(root.querySelector('[data-testid="notification-toast"]')?.classList)
      .toContain('notification-toast--success');
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('role')).toBe('status');

    notifications$.next(buildNotification('normal-event', 'normal'));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('data-tone')).toBe('warning');
    expect(root.querySelector('[data-testid="notification-toast"]')?.classList)
      .toContain('notification-toast--warning');
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('role')).toBe('status');

    notifications$.next(buildNotification('high-event', 'high'));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('data-tone')).toBe('error');
    expect(root.querySelector('[data-testid="notification-toast"]')?.classList)
      .toContain('notification-toast--error');
    expect(root.querySelector('[data-testid="notification-toast"]')?.getAttribute('role')).toBe('alert');
  });

  it('persists opt-in notification sound and plays a short cue for new notifications', () => {
    const originalAudioContext = window.AudioContext;
    const oscillator = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
      type: '',
    };
    const gain = {
      connect: vi.fn(),
      gain: { value: 0 },
    };
    const audioContext = {
      createGain: vi.fn(() => gain),
      createOscillator: vi.fn(() => oscillator),
      currentTime: 3,
      destination: {},
    };
    const audioConstructor = vi.fn(function AudioContextMock() {
      return audioContext;
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: audioConstructor,
    });

    try {
      const root = fixture.nativeElement as HTMLElement;
      const soundToggle = root.querySelector('[data-testid="notification-sound-toggle"]') as HTMLButtonElement;

      expect(soundToggle.getAttribute('aria-pressed')).toBe('false');
      expect(soundToggle.getAttribute('aria-label')).toBe('Enable notification sound');

      notifications$.next(buildNotification('muted-event', 'normal'));
      fixture.detectChanges();
      expect(audioConstructor).not.toHaveBeenCalled();

      soundToggle.click();
      fixture.detectChanges();

      expect(soundToggle.getAttribute('aria-pressed')).toBe('true');
      expect(soundToggle.getAttribute('aria-label')).toBe('Disable notification sound');
      expect(window.localStorage.getItem('tnl.notificationSoundEnabled')).toBe('true');

      notifications$.next(buildNotification('sound-event', 'normal'));
      fixture.detectChanges();

      expect(audioConstructor).toHaveBeenCalledOnce();
      expect(audioContext.createOscillator).toHaveBeenCalledOnce();
      expect(audioContext.createGain).toHaveBeenCalledOnce();
      expect(oscillator.frequency.value).toBe(880);
      expect(gain.gain.value).toBe(0.04);
      expect(oscillator.start).toHaveBeenCalledOnce();
      expect(oscillator.stop).toHaveBeenCalledWith(3.12);
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: originalAudioContext,
      });
    }
  });

  it('shows a manual retry action when the notification connection is terminal', async () => {
    const root = fixture.nativeElement as HTMLElement;

    notificationState$.next('failed');
    await settleNotificationComponent();
    let retry = root.querySelector('[data-testid="notification-retry"]') as HTMLButtonElement | null;

    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Failed');
    expect(retry).not.toBeNull();

    retry?.click();
    await settleNotificationComponent();

    expect(notificationService.retry).toHaveBeenCalledOnce();

    notificationState$.next('disconnected');
    await settleNotificationComponent();
    retry = root.querySelector('[data-testid="notification-retry"]') as HTMLButtonElement | null;

    expect(root.querySelector('[data-testid="notification-state"]')?.textContent).toContain('Disconnected');
    expect(retry).not.toBeNull();
  });

  it('marks notifications as read and clears the list', async () => {
    notifications$.next(buildNotification('read-event', 'high'));
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      togglePanel: () => void;
      markAsRead: (id: string) => void;
      clearAll: () => void;
      unreadCount: () => number;
    };

    expect(component.unreadCount()).toBe(1);
    component.markAsRead('read-event');
    fixture.detectChanges();
    expect(component.unreadCount()).toBe(0);

    component.togglePanel();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="notification-list-item"]')).not.toBeNull();

    component.clearAll();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="notification-list-item"]')).toBeNull();
  });

  it('uses browser notifications when permission is already granted', () => {
    const originalNotification = window.Notification;
    const notificationConstructor = vi.fn();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(notificationConstructor, { permission: 'granted' }),
    });

    try {
      notifications$.next(buildNotification('browser-event', 'high'));

      expect(notificationConstructor).toHaveBeenCalledWith('INVENTORY_SCANNED', {
        body: 'inventory / browser-event',
        tag: 'browser-event',
      });
    } finally {
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: originalNotification,
      });
    }
  });

  it('unsubscribes and disconnects on destroy', () => {
    fixture.destroy();

    expect(notificationService.unsubscribe).toHaveBeenCalledWith({ eventType: 'LEDGER_EVENT' });
    expect(notificationService.disconnect).toHaveBeenCalledOnce();
  });
});

function buildNotification(subjectId: string, priority: LedgerNotification['priority']): LedgerNotification {
  return {
    event: 'LEDGER_EVENT_CREATED',
    priority,
    category: 'ledger',
    occurredAt: '2026-06-25T12:00:00.000Z',
    ledgerEvent: {
      id: subjectId,
      type: 'LEDGER_EVENT',
      actorType: 'device',
      actorId: 'scanner-1',
      subjectType: 'inventory',
      subjectId,
      payload: { action: 'INVENTORY_SCANNED' },
      metadata: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        requestId: `request-${subjectId}`,
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
