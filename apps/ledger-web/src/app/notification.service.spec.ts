import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { LedgerEventResponseSchema } from '@true-north-ledger/shared-models';
import { AuthService } from './auth.service';
import {
  NOTIFICATION_SOCKET_FACTORY,
  NotificationService,
  type NotificationSocketFactory,
} from './notification.service';

describe('NotificationService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const disconnect = vi.fn();
  const emit = vi.fn();
  const socketFactory = vi.fn(() => ({
    on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      handlers.set(eventName, handler);
      return undefined as never;
    }),
    emit,
    disconnect,
  }));
  const authService = {
    accessToken: 'access-token',
    authHeaders: vi.fn(() => ({ Authorization: 'Bearer access-token' })),
    getCurrentUser: vi.fn(() => ({
      userId: 'admin',
      username: 'admin',
      actorType: 'user',
      tenantId,
      permissions: ['ledger.read'],
    })),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    window.localStorage.removeItem('tnl.socketBaseUrl');
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        {
          provide: NOTIFICATION_SOCKET_FACTORY,
          useValue: socketFactory as unknown as NotificationSocketFactory,
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the generic notification namespace and tracks connection states', () => {
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect')?.();
    handlers.get('reconnect_attempt')?.();
    handlers.get('connect_error')?.();
    handlers.get('reconnect_failed')?.();
    handlers.get('disconnect')?.();

    expect(socketFactory).toHaveBeenCalledWith(
      '/ws',
      expect.objectContaining({
        auth: { token: 'access-token' },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 30_000,
        reconnectionAttempts: 5,
        randomizationFactor: 0,
      }),
    );
    expect(states).toEqual([
      'disconnected',
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
      'reconnecting',
      'failed',
      'disconnected',
    ]);
  });

  it('uses the configured socket base URL for browser-matrix runs', () => {
    window.localStorage.setItem('tnl.socketBaseUrl', 'http://localhost:3000/');
    const service = TestBed.inject(NotificationService);

    service.connect();

    expect(socketFactory).toHaveBeenCalledWith(
      'http://localhost:3000/ws',
      expect.objectContaining({
        auth: { token: 'access-token' },
      }),
    );
  });

  it('renders reconnecting for post-connect transport failures and failed for initial failures', () => {
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect_error')?.();

    expect(states).toEqual([
      'disconnected',
      'disconnected',
      'connecting',
      'failed',
    ]);

    states.length = 0;
    service.connect();
    handlers.get('connect')?.();
    handlers.get('disconnect')?.();
    handlers.get('connect_error')?.();
    handlers.get('reconnect_failed')?.();

    expect(states).toEqual([
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
      'reconnecting',
      'failed',
    ]);
  });

  it('moves an established connection into reconnecting when the browser goes offline', () => {
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect')?.();
    window.dispatchEvent(new Event('offline'));

    expect(states.at(-1)).toBe('reconnecting');
  });

  it('disconnects the notification socket during page lifecycle teardown', () => {
    const service = TestBed.inject(NotificationService);

    service.connect();
    window.dispatchEvent(new Event('pagehide'));

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('moves reconnecting sockets to failed after the configured retry cap', () => {
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect')?.();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      handlers.get('connect_error')?.();
    }

    expect(states.slice(-5)).toEqual([
      'reconnecting',
      'reconnecting',
      'reconnecting',
      'reconnecting',
      'failed',
    ]);
  });

  it('fails a reconnecting socket when no retry result arrives before the terminal timeout', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect')?.();
    handlers.get('disconnect')?.();
    vi.advanceTimersByTime(6_000);

    expect(states.slice(-2)).toEqual(['reconnecting', 'failed']);
  });

  it('manually retries by opening a fresh notification socket connection', () => {
    const service = TestBed.inject(NotificationService);

    service.connect();
    handlers.get('reconnect_failed')?.();
    service.retry();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(socketFactory).toHaveBeenLastCalledWith(
      '/ws',
      expect.objectContaining({
        auth: { token: 'access-token' },
        reconnectionAttempts: 5,
      }),
    );
  });

  it('subscribes and unsubscribes with ack validation', () => {
    const service = TestBed.inject(NotificationService);
    const subscriptionResponses: unknown[] = [];
    const unsubscribeResponses: unknown[] = [];
    emit.mockImplementation(
      (
        eventName: string,
        _payload: unknown,
        acknowledge: (response: unknown) => void,
      ) => {
        acknowledge({
          subscribed: eventName === 'subscribe',
          rooms: [`tenant:${tenantId}:event_type:LEDGER_EVENT`],
          timestamp: '2026-06-25T12:00:00.000Z',
        });
      },
    );

    service.connect();
    service
      .subscribe({ eventType: 'LEDGER_EVENT' })
      .subscribe((response) => subscriptionResponses.push(response));
    service
      .unsubscribe({ eventType: 'LEDGER_EVENT' })
      .subscribe((response) => unsubscribeResponses.push(response));

    expect(emit).toHaveBeenCalledWith(
      'subscribe',
      { eventType: 'LEDGER_EVENT' },
      expect.any(Function),
    );
    expect(emit).toHaveBeenCalledWith(
      'unsubscribe',
      { eventType: 'LEDGER_EVENT' },
      expect.any(Function),
    );
    expect(subscriptionResponses).toEqual([
      {
        subscribed: true,
        rooms: [`tenant:${tenantId}:event_type:LEDGER_EVENT`],
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    ]);
    expect(unsubscribeResponses).toEqual([
      {
        subscribed: false,
        rooms: [`tenant:${tenantId}:event_type:LEDGER_EVENT`],
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    ]);
  });

  it('re-subscribes active filters after a reconnect and clears them on manual disconnect', () => {
    const service = TestBed.inject(NotificationService);
    const http = TestBed.inject(HttpTestingController);
    emit.mockImplementation(
      (
        eventName: string,
        _payload: unknown,
        acknowledge: (response: unknown) => void,
      ) => {
        acknowledge({
          subscribed: eventName === 'subscribe',
          rooms: [`tenant:${tenantId}:subject:order:order-1`],
          timestamp: '2026-06-25T12:00:00.000Z',
        });
      },
    );

    service.connect();
    handlers.get('connect')?.();
    service.subscribe({ subjectType: 'order', subjectId: 'order-1' }).subscribe();

    expect(emit).toHaveBeenCalledTimes(1);
    handlers.get('disconnect')?.();
    handlers.get('reconnect_attempt')?.();
    handlers.get('connect')?.();
    http.expectOne('/api/v1/ledger/events').flush([]);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(
      'subscribe',
      { subjectType: 'order', subjectId: 'order-1' },
      expect.any(Function),
    );

    service.disconnect();
    handlers.get('connect')?.();

    expect(emit).toHaveBeenCalledTimes(2);
    http.verify();
  });

  it('fetches missed ledger events after reconnect and skips events already observed from the socket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
    const service = TestBed.inject(NotificationService);
    const http = TestBed.inject(HttpTestingController);
    const notifications: unknown[] = [];
    service.notifications$.subscribe((notification) =>
      notifications.push(notification),
    );

    service.connect();
    handlers.get('connect')?.();
    handlers.get('notification.created')?.(buildNotification(tenantId));
    vi.setSystemTime(new Date('2026-06-25T12:01:00.000Z'));
    handlers.get('disconnect')?.();
    vi.setSystemTime(new Date('2026-06-25T12:02:00.000Z'));
    handlers.get('connect')?.();

    const request = http.expectOne('/api/v1/ledger/events');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
    request.flush([
      buildLedgerEvent({
        id: '550e8400-e29b-41d4-a716-446655440000',
        createdAt: '2026-06-25T12:00:00.000Z',
        subjectId: 'order-1',
      }),
      buildLedgerEvent({
        id: '550e8400-e29b-41d4-a716-446655440010',
        createdAt: '2026-06-25T12:01:30.000Z',
        subjectId: 'order-2',
      }),
      buildLedgerEvent({
        id: '550e8400-e29b-41d4-a716-446655440011',
        createdAt: '2026-06-25T12:01:45.000Z',
        subjectId: 'order-3',
      }),
    ]);

    expect(notifications).toHaveLength(3);
    expect(notifications.map((notification) => notification)).toEqual([
      expect.objectContaining({
        event: 'LEDGER_EVENT_CREATED',
        ledgerEvent: expect.objectContaining({ subjectId: 'order-1' }),
      }),
      expect.objectContaining({
        event: 'LEDGER_EVENT_CREATED',
        priority: 'normal',
        ledgerEvent: expect.objectContaining({ subjectId: 'order-2' }),
        metadata: { source: 'missed-event-recovery' },
      }),
      expect.objectContaining({
        event: 'LEDGER_EVENT_CREATED',
        priority: 'normal',
        ledgerEvent: expect.objectContaining({ subjectId: 'order-3' }),
        metadata: { source: 'missed-event-recovery' },
      }),
    ]);

    http.verify();
  });

  it('sends heartbeat pings after connect and stops them on disconnect', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));
    emit.mockImplementation(
      (eventName: string, acknowledge: (response: unknown) => void) => {
        if (eventName === 'heartbeat.ping') {
          acknowledge({
            type: 'heartbeat.pong',
            timestamp: '2026-06-25T12:00:00.000Z',
          });
        }
      },
    );

    service.connect();
    vi.advanceTimersByTime(30_000);
    expect(emit).not.toHaveBeenCalledWith('heartbeat.ping', expect.any(Function));

    handlers.get('connect')?.();
    vi.advanceTimersByTime(30_000);
    expect(emit).toHaveBeenCalledWith('heartbeat.ping', expect.any(Function));

    handlers.get('disconnect')?.();
    emit.mockClear();
    vi.advanceTimersByTime(30_000);

    expect(emit).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe('failed');
  });

  it('marks the connection failed when a heartbeat response is malformed', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(NotificationService);
    const states: string[] = [];
    service.connectionState$.subscribe((state) => states.push(state));
    emit.mockImplementation(
      (eventName: string, acknowledge: (response: unknown) => void) => {
        if (eventName === 'heartbeat.ping') {
          acknowledge({ type: 'unexpected' });
        }
      },
    );

    service.connect();
    handlers.get('connect')?.();
    vi.advanceTimersByTime(30_000);

    expect(states.at(-1)).toBe('failed');
  });

  it('publishes valid ledger notifications and rejects malformed payloads', () => {
    const service = TestBed.inject(NotificationService);
    const notifications: unknown[] = [];
    service.notifications$.subscribe((notification) =>
      notifications.push(notification),
    );
    service.connect();

    handlers.get('notification.created')?.({ invalid: true });
    handlers.get('notification.created')?.(buildNotification(tenantId));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      event: 'LEDGER_EVENT_CREATED',
      category: 'ledger',
      ledgerEvent: { subjectType: 'order', subjectId: 'order-1' },
    });
  });

  it('disconnects when no ledger-readable authenticated user is available', () => {
    authService.getCurrentUser.mockReturnValueOnce({
      userId: 'viewer',
      username: 'viewer',
      actorType: 'user',
      tenantId,
      permissions: ['orders.read'],
    });
    const service = TestBed.inject(NotificationService);

    service.connect();

    expect(socketFactory).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  function buildLedgerEvent({
    id,
    createdAt,
    subjectId,
  }: {
    id: string;
    createdAt: string;
    subjectId: string;
  }) {
    return LedgerEventResponseSchema.parse({
      id,
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'admin',
      subjectType: 'order',
      subjectId,
      payload: { action: 'created' },
      metadata: {
        tenantId,
        requestId: 'request-1',
        correlationId: 'correlation-1',
        payloadHash: 'a'.repeat(64),
        eventHash: 'b'.repeat(64),
        chainSequence: 1,
        result: 'accepted',
        timestamp: createdAt,
      },
      createdAt,
    });
  }

  function buildNotification(notificationTenantId: string) {
    const ledgerEvent = buildLedgerEvent({
      id: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: '2026-06-25T12:00:00.000Z',
      subjectId: 'order-1',
    });
    ledgerEvent.metadata.tenantId = notificationTenantId;
    return {
      event: 'LEDGER_EVENT_CREATED',
      priority: 'high',
      category: 'ledger',
      ledgerEvent,
      occurredAt: '2026-06-25T12:00:00.000Z',
    };
  }
});
