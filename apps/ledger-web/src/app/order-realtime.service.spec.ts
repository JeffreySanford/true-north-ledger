import { TestBed } from '@angular/core/testing';
import { OrderExample } from '@true-north-ledger/order-contracts';
import { AuthService } from './auth.service';
import {
  ORDER_SOCKET_FACTORY,
  OrderRealtimeService,
  type OrderSocketFactory,
} from './order-realtime.service';

describe('OrderRealtimeService', () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const disconnect = vi.fn();
  const socketFactory = vi.fn(() => ({
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return undefined as never;
    }),
    disconnect,
  }));
  const authService = {
    accessToken: 'access-token',
    getCurrentUser: vi.fn(() => ({
      userId: 'admin',
      username: 'admin',
      actorType: 'user',
      tenantId: OrderExample.tenantId,
      permissions: ['orders.read'],
    })),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    window.localStorage.removeItem('tnl.socketBaseUrl');
    TestBed.configureTestingModule({
      providers: [
        OrderRealtimeService,
        { provide: AuthService, useValue: authService },
        {
          provide: ORDER_SOCKET_FACTORY,
          useValue: socketFactory as unknown as OrderSocketFactory,
        },
      ],
    });
  });

  it('connects with the access token and publishes valid tenant events', () => {
    const service = TestBed.inject(OrderRealtimeService);
    const events: unknown[] = [];
    const states: boolean[] = [];
    service.events$.subscribe((event) => events.push(event));
    service.connected$.subscribe((state) => states.push(state));

    service.connect();
    handlers.get('connect')?.();
    handlers.get('order.updated')?.({
      type: 'created',
      order: OrderExample,
      occurredAt: '2026-06-12T01:00:00.000Z',
    });

    expect(socketFactory).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({ auth: { token: 'access-token' } }),
    );
    expect(states.at(-1)).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('uses the configured socket base URL for browser-matrix runs', () => {
    window.localStorage.setItem('tnl.socketBaseUrl', 'http://localhost:3000/');
    const service = TestBed.inject(OrderRealtimeService);

    service.connect();

    expect(socketFactory).toHaveBeenCalledWith(
      'http://localhost:3000/orders',
      expect.objectContaining({
        auth: { token: 'access-token' },
      }),
    );
  });

  it('acknowledges server heartbeat pings to keep the socket connected', () => {
    const service = TestBed.inject(OrderRealtimeService);
    const acknowledge = vi.fn();

    service.connect();
    handlers.get('heartbeat.ping')?.(
      { timestamp: '2026-06-25T12:00:00.000Z' },
      acknowledge,
    );

    expect(acknowledge).toHaveBeenCalledWith({
      event: 'heartbeat.pong',
      timestamp: expect.any(String),
    });
  });

  it('disconnects the order socket during page lifecycle teardown', () => {
    const service = TestBed.inject(OrderRealtimeService);

    service.connect();
    window.dispatchEvent(new Event('pagehide'));

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed and cross-tenant events and disconnects cleanly', () => {
    const service = TestBed.inject(OrderRealtimeService);
    const events: unknown[] = [];
    service.events$.subscribe((event) => events.push(event));
    service.connect();

    handlers.get('order.updated')?.({ invalid: true });
    handlers.get('order.updated')?.({
      type: 'created',
      order: { ...OrderExample, tenantId: '22222222-2222-4222-8222-222222222222' },
      occurredAt: '2026-06-12T01:00:00.000Z',
    });
    service.disconnect();

    expect(events).toEqual([]);
    expect(disconnect).toHaveBeenCalled();
  });
});
