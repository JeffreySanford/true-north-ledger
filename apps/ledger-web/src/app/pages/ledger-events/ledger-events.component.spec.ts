/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { LedgerEventResponse } from '@true-north-ledger/shared-models';
import { LedgerEventsService } from '../../ledger-events.service';
import {
  NotificationService,
  type LedgerNotification,
  type NotificationConnectionState,
} from '../../notification.service';
import { LedgerEventsComponent } from './ledger-events.component';

function buildEvent(action: string, id = '550e8400-e29b-41d4-a716-446655440000'): LedgerEventResponse {
  return {
    id,
    type: 'LEDGER_EVENT',
    actorType: 'user',
    actorId: 'admin',
    subjectType: 'auth',
    subjectId: 'admin',
    payload: {
      action,
      username: 'admin',
    },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      sourceIp: '127.0.0.1',
      userAgent: 'vitest',
      payloadHash: 'a'.repeat(64),
      eventHash: 'b'.repeat(64),
      chainSequence: 1,
      result: 'accepted',
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

describe('LedgerEventsComponent', () => {
  let fixture: ComponentFixture<LedgerEventsComponent>;
  let fetchEventsMock: ReturnType<typeof vi.fn>;
  let createDemoEventMock: ReturnType<typeof vi.fn>;
  let notificationState$: BehaviorSubject<NotificationConnectionState>;
  let notifications$: Subject<LedgerNotification>;
  let notificationService: {
    connectionState$: BehaviorSubject<NotificationConnectionState>;
    notifications$: Subject<LedgerNotification>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fetchEventsMock = vi.fn(() => of([buildEvent('LOGIN_SUCCESS')]));
    createDemoEventMock = vi.fn(() => of(buildEvent('LOGIN_SUCCESS', '550e8400-e29b-41d4-a716-446655440001')));
    notificationState$ =
      new BehaviorSubject<NotificationConnectionState>('disconnected');
    notifications$ = new Subject<LedgerNotification>();
    notificationService = {
      connectionState$: notificationState$,
      notifications$,
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribe: vi.fn(() =>
        of({
          subscribed: true,
          rooms: ['tenant:00000000-0000-0000-0000-000000000000:event_type:LEDGER_EVENT'],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
      unsubscribe: vi.fn(() =>
        of({
          subscribed: false,
          rooms: ['tenant:00000000-0000-0000-0000-000000000000:event_type:LEDGER_EVENT'],
          timestamp: '2026-06-25T12:00:00.000Z',
        }),
      ),
    };

    await TestBed.configureTestingModule({
      declarations: [LedgerEventsComponent],
      providers: [
        {
          provide: LedgerEventsService,
          useValue: {
            fetchEvents: fetchEventsMock,
            createDemoEvent: createDemoEventMock,
          },
        },
        {
          provide: NotificationService,
          useValue: notificationService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LedgerEventsComponent);
  });

  it('renders audit action and metadata for loaded events', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('LOGIN_SUCCESS');
    expect(root.textContent).toContain('Actor: user / admin');
    expect(root.textContent).toContain('Result: accepted');
    expect(root.textContent).toContain('Request: request-1');
    expect(root.textContent).toContain('Correlation: correlation-1');
    expect(root.textContent).toContain('Source IP: 127.0.0.1');
    expect(root.textContent).toContain('User Agent: vitest');
    expect(notificationService.connect).toHaveBeenCalledOnce();
  });

  it('subscribes to live ledger events after socket connection', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    notificationState$.next('connected');
    fixture.detectChanges();

    expect(notificationService.subscribe).toHaveBeenCalledWith({
      eventType: 'LEDGER_EVENT',
    });
  });

  it('prepends live ledger notifications and deduplicates by event id', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    notifications$.next(buildNotification(buildEvent('LIVE_EVENT', '550e8400-e29b-41d4-a716-446655440010')));
    notifications$.next(buildNotification(buildEvent('LIVE_EVENT_UPDATED', '550e8400-e29b-41d4-a716-446655440010')));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="ledger-event-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('LIVE_EVENT_UPDATED');
    expect(rows[0].getAttribute('data-event-id')).toBe('550e8400-e29b-41d4-a716-446655440010');
    expect(rows[0].getAttribute('data-live-event')).toBe('true');
    expect(rows[0].classList.contains('ledger-event-row--live')).toBe(true);
    expect(rows[1].textContent).toContain('LOGIN_SUCCESS');
    expect(rows[1].getAttribute('data-live-event')).toBe('false');
  });

  it('shows an error message when loading fails', async () => {
    fetchEventsMock.mockReturnValueOnce(throwError(() => new Error('Failed to fetch ledger events')));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Error: Failed to fetch ledger events');
  });

  it('prepends created events after create demo action', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.createDemo();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="ledger-event-row"]');
    expect(rows.length).toBe(2);
    expect(createDemoEventMock).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when demo event creation fails', async () => {
    createDemoEventMock.mockReturnValueOnce(throwError(() => 'create failed'));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.createDemo();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Error: create failed');
    expect(component.loading).toBe(false);
  });

  it('tracks event rows by immutable ledger event id', () => {
    const component = fixture.componentInstance;
    const event = buildEvent('LOGIN_SUCCESS', '550e8400-e29b-41d4-a716-446655440099');

    expect(component.trackById(0, event)).toBe('550e8400-e29b-41d4-a716-446655440099');
  });

  it('does not mark REST-loaded or locally created demo events as live notifications', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.createDemo();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="ledger-event-row"]');
    expect(rows[0].getAttribute('data-live-event')).toBe('false');
    expect(rows[1].getAttribute('data-live-event')).toBe('false');
  });

  it('unsubscribes from live ledger events on destroy', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();

    expect(notificationService.unsubscribe).toHaveBeenCalledWith({
      eventType: 'LEDGER_EVENT',
    });
    expect(notificationService.disconnect).toHaveBeenCalledOnce();
  });

  function buildNotification(ledgerEvent: LedgerEventResponse): LedgerNotification {
    return {
      event: 'LEDGER_EVENT_CREATED',
      priority: 'normal',
      category: 'ledger',
      ledgerEvent,
      occurredAt: ledgerEvent.createdAt,
    };
  }
});
