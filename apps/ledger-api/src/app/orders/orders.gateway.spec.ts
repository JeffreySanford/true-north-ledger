import type { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { TokenBlacklistService } from '../auth/token-blacklist.service';
import { OrderExample } from '@true-north-ledger/order-contracts';
import { OrdersGateway } from './orders.gateway';

describe('OrdersGateway', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const tokenBlacklistService = { isJtiBlacklisted: jest.fn() };
  let gateway: OrdersGateway;
  let heartbeatEmit: jest.Mock;
  let client: Pick<
    Socket,
    'id' | 'handshake' | 'join' | 'disconnect' | 'timeout'
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    gateway = new OrdersGateway(
      jwtService as unknown as JwtService,
      tokenBlacklistService as unknown as TokenBlacklistService,
    );
    heartbeatEmit = jest.fn();
    client = {
      id: 'socket-1',
      handshake: {
        auth: { token: 'access-token' },
        headers: {},
      } as Socket['handshake'],
      join: jest.fn(),
      disconnect: jest.fn(),
      timeout: jest.fn(() => ({ emit: heartbeatEmit })),
    };
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('joins authenticated order readers to their tenant room and tracks connection state', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId: OrderExample.tenantId,
      permissions: ['orders.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);

    await gateway.handleConnection(client as Socket);

    expect(client.join).toHaveBeenCalledWith(`tenant:${OrderExample.tenantId}`);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(gateway.getActiveConnectionCount()).toBe(1);
    expect(gateway.handleGetStatus(client as Socket)).toMatchObject({
      connected: true,
      clientId: 'socket-1',
      tenantId: OrderExample.tenantId,
      namespace: '/orders',
      subscriptions: [`tenant:${OrderExample.tenantId}`],
      activeConnections: 1,
      connectedAt: expect.any(String),
      heartbeatIntervalMs: 30_000,
      timestamp: expect.any(String),
    });
  });

  it('disconnects missing, revoked, and unauthorized tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId: OrderExample.tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);

    client.handshake.auth = {};
    await gateway.handleConnection(client as Socket);
    expect(client.disconnect).toHaveBeenCalledTimes(2);
    expect(gateway.getActiveConnectionCount()).toBe(0);
  });

  it('removes connection state on disconnect', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId: OrderExample.tenantId,
      permissions: ['orders.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    gateway.handleDisconnect(client as Socket);

    expect(gateway.getActiveConnectionCount()).toBe(0);
    expect(gateway.handleGetStatus(client as Socket)).toMatchObject({
      connected: false,
      clientId: 'socket-1',
      namespace: '/orders',
      subscriptions: [],
      activeConnections: 0,
      heartbeatIntervalMs: 30_000,
      timestamp: expect.any(String),
    });
  });

  it('responds to ping messages with a timestamped pong', () => {
    expect(gateway.handlePing()).toEqual({
      event: 'pong',
      timestamp: expect.any(String),
    });
  });

  it('sends heartbeat pings every 30 seconds', async () => {
    jest.useFakeTimers();
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId: OrderExample.tenantId,
      permissions: ['orders.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    gateway.afterInit();
    jest.advanceTimersByTime(30_000);

    expect(client.timeout).toHaveBeenCalledWith(5_000);
    expect(heartbeatEmit).toHaveBeenCalledWith(
      'heartbeat.ping',
      { timestamp: expect.any(String) },
      expect.any(Function),
    );
  });

  it('disconnects clients that do not acknowledge heartbeat pings', async () => {
    jest.useFakeTimers();
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId: OrderExample.tenantId,
      permissions: ['orders.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);
    heartbeatEmit.mockImplementation(
      (
        _eventName: string,
        _payload: unknown,
        acknowledge: (error: Error | null) => void,
      ) => acknowledge(new Error('ack timeout')),
    );

    gateway.afterInit();
    jest.advanceTimersByTime(30_000);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(gateway.getActiveConnectionCount()).toBe(0);
  });

  it('emits updates only to the matching tenant room', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as unknown as { server: Pick<Server, 'to'> }).server = {
      to,
    } as Pick<Server, 'to'>;
    const event = {
      type: 'created' as const,
      order: OrderExample,
      occurredAt: '2026-06-12T01:00:00.000Z',
    };

    gateway.emitOrderEvent(OrderExample.tenantId, event);

    expect(to).toHaveBeenCalledWith(`tenant:${OrderExample.tenantId}`);
    expect(emit).toHaveBeenCalledWith('order.updated', event);
  });
});
