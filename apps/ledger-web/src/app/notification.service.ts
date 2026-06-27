import { HttpClient } from '@angular/common/http';
import { NgZone, inject, Injectable, InjectionToken, type OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client';
import { z } from 'zod';
import {
  LedgerNotificationSchema,
  LedgerEventResponseSchema,
  type LedgerEventResponse,
  type LedgerNotification as SharedLedgerNotification,
} from '@true-north-ledger/shared-models';
import { AuthService } from './auth.service';

export type LedgerNotification = SharedLedgerNotification;

export type NotificationConnectionState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface NotificationSubscriptionFilter {
  eventType?: string;
  subjectType?: string;
  subjectId?: string;
  actorType?: string;
  actorId?: string;
}

export interface NotificationSubscriptionResponse {
  subscribed: boolean;
  rooms: string[];
  timestamp: string;
}

export interface NotificationPongResponse {
  type: 'heartbeat.pong';
  timestamp: string;
}

interface NotificationSocket {
  on(eventName: string, handler: (...args: unknown[]) => void): NotificationSocket;
  emit(eventName: string, ...args: unknown[]): NotificationSocket;
  disconnect(): NotificationSocket;
}

export type NotificationSocketFactory = (
  namespace: string,
  options: Partial<ManagerOptions & SocketOptions>,
) => NotificationSocket;

export const NOTIFICATION_SOCKET_FACTORY =
  new InjectionToken<NotificationSocketFactory>('NOTIFICATION_SOCKET_FACTORY', {
    providedIn: 'root',
    factory: () => (namespace, options) =>
      io(namespace, options) as unknown as NotificationSocket,
  });

const NotificationSubscriptionResponseSchema = z.object({
  subscribed: z.boolean(),
  rooms: z.array(z.string()),
  timestamp: z.string(),
});

const NotificationPongResponseSchema = z.object({
  type: z.literal('heartbeat.pong'),
  timestamp: z.string(),
});

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly socketFactory = inject(NOTIFICATION_SOCKET_FACTORY);
  private readonly zone = inject(NgZone);
  private socket: NotificationSocket | null = null;
  private readonly connectionStateSubject =
    new BehaviorSubject<NotificationConnectionState>('disconnected');
  private readonly notificationsSubject = new Subject<LedgerNotification>();
  private readonly activeSubscriptions = new Map<
    string,
    NotificationSubscriptionFilter
  >();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectFailureTimer: ReturnType<typeof setTimeout> | null = null;
  private hasConnected = false;
  private reconnectErrorCount = 0;
  private lastDisconnectedAt: Date | null = null;
  private readonly observedLedgerEventIds = new Set<string>();
  private readonly disconnectForPageLifecycle = (): void => this.disconnect();

  readonly connectionState$ = this.connectionStateSubject.asObservable();
  readonly notifications$ = this.notificationsSubject.asObservable();

  constructor() {
    this.bindBrowserConnectivityEvents();
    this.bindPageLifecycleEvents();
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.disconnectForPageLifecycle);
      window.removeEventListener('beforeunload', this.disconnectForPageLifecycle);
    }
    this.disconnect();
  }

  connect(): void {
    const token = this.authService.accessToken;
    const user = this.authService.getCurrentUser();
    if (
      !token ||
      !user ||
      (!user.permissions.includes('admin') &&
        !user.permissions.includes('ledger.read'))
    ) {
      this.disconnect();
      return;
    }

    if (
      this.socket &&
      ['connecting', 'connected', 'reconnecting'].includes(this.connectionStateSubject.value)
    ) {
      return;
    }

    this.disconnect();
    this.reconnectErrorCount = 0;
    this.connectionStateSubject.next('connecting');
    this.socket = this.socketFactory(this.socketNamespace('/ws'), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: 5,
      randomizationFactor: 0,
    });
    this.socket.on('connect', () => {
      const shouldRecoverMissedEvents =
        this.connectionStateSubject.value === 'reconnecting' &&
        this.lastDisconnectedAt !== null;
      this.hasConnected = true;
      this.reconnectErrorCount = 0;
      this.clearReconnectFailureTimer();
      this.zone.run(() => this.connectionStateSubject.next('connected'));
      this.startHeartbeat();
      this.resubscribeActiveFilters();
      const disconnectedAt = this.lastDisconnectedAt;
      this.lastDisconnectedAt = null;
      if (shouldRecoverMissedEvents && disconnectedAt) {
        this.fetchMissedLedgerEvents(disconnectedAt);
      }
    });
    this.socket.on('disconnect', () => {
      this.stopHeartbeat();
      this.zone.run(() => {
        if (this.shouldAttemptReconnect()) {
          this.lastDisconnectedAt = new Date();
          this.markReconnecting();
          return;
        }
        this.connectionStateSubject.next('disconnected');
      });
    });
    this.socket.on('connect_error', () =>
      this.zone.run(() => this.handleConnectionError()),
    );
    this.socket.on('reconnect_attempt', () =>
      this.zone.run(() => this.markReconnecting()),
    );
    this.socket.on('reconnect_failed', () =>
      this.zone.run(() => {
        this.hasConnected = false;
        this.reconnectErrorCount = 0;
        this.clearReconnectFailureTimer();
        this.connectionStateSubject.next('failed');
      }),
    );
    this.socket.on('notification.created', (raw: unknown) => {
      const parsed = LedgerNotificationSchema.safeParse(raw);
      if (parsed.success) {
        this.zone.run(() => {
          this.observedLedgerEventIds.add(parsed.data.ledgerEvent.id);
          this.notificationsSubject.next(parsed.data);
        });
      }
    });
  }

  subscribe(
    filter: NotificationSubscriptionFilter,
  ): Observable<NotificationSubscriptionResponse> {
    return this.emitSubscription('subscribe', filter);
  }

  unsubscribe(
    filter: NotificationSubscriptionFilter,
  ): Observable<NotificationSubscriptionResponse> {
    return this.emitSubscription('unsubscribe', filter);
  }

  retry(): void {
    this.connect();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectFailureTimer();
    this.hasConnected = false;
    this.reconnectErrorCount = 0;
    this.lastDisconnectedAt = null;
    this.socket?.disconnect();
    this.socket = null;
    this.activeSubscriptions.clear();
    this.connectionStateSubject.next('disconnected');
  }

  private emitSubscription(
    eventName: 'subscribe' | 'unsubscribe',
    filter: NotificationSubscriptionFilter,
  ): Observable<NotificationSubscriptionResponse> {
    if (!this.socket) {
      return of({
        subscribed: false,
        rooms: [],
        timestamp: new Date().toISOString(),
      });
    }

    return new Observable<NotificationSubscriptionResponse>((subscriber) => {
      this.socket?.emit(
        eventName,
        filter,
        (response: NotificationSubscriptionResponse) => {
          this.zone.run(() => {
            const parsed =
              NotificationSubscriptionResponseSchema.safeParse(response);
            if (!parsed.success) {
              subscriber.error(
                new Error('Invalid notification subscription response'),
              );
              return;
            }
            this.rememberSubscription(eventName, filter, parsed.data);
            subscriber.next(parsed.data);
            subscriber.complete();
          });
        },
      );
    });
  }

  private rememberSubscription(
    eventName: 'subscribe' | 'unsubscribe',
    filter: NotificationSubscriptionFilter,
    response: NotificationSubscriptionResponse,
  ): void {
    const key = this.subscriptionKey(filter);
    if (eventName === 'subscribe' && response.subscribed) {
      this.activeSubscriptions.set(key, { ...filter });
      return;
    }
    if (eventName === 'unsubscribe' && !response.subscribed) {
      this.activeSubscriptions.delete(key);
    }
  }

  private resubscribeActiveFilters(): void {
    if (!this.socket || this.activeSubscriptions.size === 0) {
      return;
    }

    for (const filter of this.activeSubscriptions.values()) {
      this.socket.emit('subscribe', filter, (response: unknown) => {
        const parsed = NotificationSubscriptionResponseSchema.safeParse(response);
        if (!parsed.success || !parsed.data.subscribed) {
          this.activeSubscriptions.delete(this.subscriptionKey(filter));
        }
      });
    }
  }

  private fetchMissedLedgerEvents(disconnectedAt: Date): void {
    this.http
      .get<unknown>('/api/v1/ledger/events', { headers: this.authService.authHeaders() })
      .subscribe({
        next: (raw) => {
          const parsed = LedgerEventResponseSchema.array().safeParse(raw);
          if (!parsed.success) {
            return;
          }

          for (const event of parsed.data
            .filter((event) => new Date(event.createdAt) >= disconnectedAt)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
            if (this.observedLedgerEventIds.has(event.id)) {
              continue;
            }

            this.observedLedgerEventIds.add(event.id);
            this.zone.run(() =>
              this.notificationsSubject.next(this.toLedgerNotification(event)),
            );
          }
        },
        error: () => undefined,
      });
  }

  private toLedgerNotification(event: LedgerEventResponse): LedgerNotification {
    return {
      event: 'LEDGER_EVENT_CREATED',
      priority: 'normal',
      category: 'ledger',
      ledgerEvent: event,
      occurredAt: event.createdAt,
      metadata: {
        source: 'missed-event-recovery',
      },
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.socket?.emit('heartbeat.ping', (response: unknown) => {
        const parsed = NotificationPongResponseSchema.safeParse(response);
        if (!parsed.success) {
          this.zone.run(() => this.connectionStateSubject.next('failed'));
        }
      });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private shouldAttemptReconnect(): boolean {
    return (
      this.hasConnected ||
      this.connectionStateSubject.value === 'connected' ||
      this.connectionStateSubject.value === 'reconnecting'
    );
  }

  private handleConnectionError(): void {
    if (!this.shouldAttemptReconnect()) {
      this.connectionStateSubject.next('failed');
      return;
    }

    this.reconnectErrorCount += 1;
    if (this.reconnectErrorCount >= 5) {
      this.hasConnected = false;
      this.reconnectErrorCount = 0;
      this.clearReconnectFailureTimer();
      this.connectionStateSubject.next('failed');
      return;
    }

    this.markReconnecting();
  }

  private markReconnecting(): void {
    this.connectionStateSubject.next('reconnecting');
    if (this.reconnectFailureTimer) {
      return;
    }
    this.reconnectFailureTimer = setTimeout(() => {
      this.zone.run(() => {
        if (this.connectionStateSubject.value === 'reconnecting') {
          this.hasConnected = false;
          this.reconnectErrorCount = 0;
          this.connectionStateSubject.next('failed');
        }
        this.clearReconnectFailureTimer();
      });
    }, 6_000);
  }

  private clearReconnectFailureTimer(): void {
    if (!this.reconnectFailureTimer) {
      return;
    }
    clearTimeout(this.reconnectFailureTimer);
    this.reconnectFailureTimer = null;
  }

  private bindBrowserConnectivityEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('offline', () => {
      if (this.shouldAttemptReconnect()) {
        this.markReconnecting();
      }
    });

    window.addEventListener('online', () => {
      if (
        this.connectionStateSubject.value === 'reconnecting' ||
        this.connectionStateSubject.value === 'failed'
      ) {
        this.retry();
      }
    });
  }

  private bindPageLifecycleEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('pagehide', this.disconnectForPageLifecycle);
    window.addEventListener('beforeunload', this.disconnectForPageLifecycle);
  }

  private socketNamespace(namespace: string): string {
    const baseUrl = this.socketBaseUrl();
    return baseUrl ? `${baseUrl}${namespace}` : namespace;
  }

  private socketBaseUrl(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem('tnl.socketBaseUrl')?.replace(/\/$/, '') ?? null;
  }

  private subscriptionKey(filter: NotificationSubscriptionFilter): string {
    return JSON.stringify({
      actorId: filter.actorId ?? null,
      actorType: filter.actorType ?? null,
      eventType: filter.eventType ?? null,
      subjectId: filter.subjectId ?? null,
      subjectType: filter.subjectType ?? null,
    });
  }
}
