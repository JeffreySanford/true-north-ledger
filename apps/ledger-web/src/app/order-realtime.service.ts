import { inject, Injectable, InjectionToken, type OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import {
  OrderRealtimeEventSchema,
  type OrderRealtimeEvent,
} from '@true-north-ledger/order-contracts';
import { AuthService } from './auth.service';

export type OrderSocketFactory = (
  namespace: string,
  options: Partial<ManagerOptions & SocketOptions>,
) => Pick<Socket, 'on' | 'disconnect'>;

type HeartbeatAck = (response: { event: 'heartbeat.pong'; timestamp: string }) => void;

export const ORDER_SOCKET_FACTORY = new InjectionToken<OrderSocketFactory>(
  'ORDER_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (namespace, options) => io(namespace, options),
  },
);

@Injectable({ providedIn: 'root' })
export class OrderRealtimeService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly socketFactory = inject(ORDER_SOCKET_FACTORY);
  private socket: Pick<Socket, 'on' | 'disconnect'> | null = null;
  private readonly eventsSubject = new Subject<OrderRealtimeEvent>();
  private readonly connectedSubject = new BehaviorSubject(false);
  private readonly disconnectForPageLifecycle = (): void => this.disconnect();

  readonly events$ = this.eventsSubject.asObservable();
  readonly connected$ = this.connectedSubject.asObservable();

  constructor() {
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
        !user.permissions.includes('orders.read'))
    ) {
      this.disconnect();
      return;
    }

    this.disconnect();
    this.socket = this.socketFactory(this.socketNamespace('/orders'), {
      auth: { token },
      transports: ['websocket'],
    });
    this.socket.on('connect', () => this.connectedSubject.next(true));
    this.socket.on('disconnect', () => this.connectedSubject.next(false));
    this.socket.on('heartbeat.ping', (_payload: unknown, acknowledge?: HeartbeatAck) => {
      acknowledge?.({
        event: 'heartbeat.pong',
        timestamp: new Date().toISOString(),
      });
    });
    this.socket.on('order.updated', (raw: unknown) => {
      const parsed = OrderRealtimeEventSchema.safeParse(raw);
      if (parsed.success && parsed.data.order.tenantId === user.tenantId) {
        this.eventsSubject.next(parsed.data);
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
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
}
