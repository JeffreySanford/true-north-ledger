import { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { LedgerEventSchema } from '@true-north-ledger/ledger-contracts';
import type { Server, Socket } from 'socket.io';
import type { TokenBlacklistService } from '../auth/token-blacklist.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const jwtService = { verifyAsync: jest.fn() };
  const tokenBlacklistService = { isJtiBlacklisted: jest.fn() };
  let gateway: NotificationsGateway;
  let client: Pick<
    Socket,
    'id' | 'handshake' | 'join' | 'leave' | 'disconnect'
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    gateway = new NotificationsGateway(
      jwtService as unknown as JwtService,
      tokenBlacklistService as unknown as TokenBlacklistService,
    );
    client = {
      id: 'notification-socket-1',
      handshake: {
        auth: { token: 'access-token' },
        headers: {},
      } as Socket['handshake'],
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts authenticated ledger readers without joining broadcast rooms until subscribed', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);

    await gateway.handleConnection(client as Socket);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(gateway.getActiveConnectionCount()).toBe(1);
  });

  it('accepts bearer tokens from handshake headers', async () => {
    client.handshake.auth = {};
    client.handshake.headers.authorization = 'Bearer header-token';
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);

    await gateway.handleConnection(client as Socket);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(gateway.getActiveConnectionCount()).toBe(1);
  });

  it('disconnects missing, revoked, and unauthorized notification tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['orders.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);

    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'revoked-jti',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(true);
    await gateway.handleConnection(client as Socket);
    expect(client.disconnect).toHaveBeenCalledTimes(2);

    client.handshake.auth = {};
    await gateway.handleConnection(client as Socket);
    expect(client.disconnect).toHaveBeenCalledTimes(3);
    expect(gateway.getActiveConnectionCount()).toBe(0);
  });

  it('disconnects invalid and expired notification tokens rejected by the verifier', async () => {
    jwtService.verifyAsync.mockRejectedValueOnce(new Error('invalid token'));

    await gateway.handleConnection(client as Socket);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(gateway.getActiveConnectionCount()).toBe(0);

    jwtService.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));

    await gateway.handleConnection(client as Socket);

    expect(client.disconnect).toHaveBeenCalledTimes(2);
    expect(gateway.getActiveConnectionCount()).toBe(0);
  });

  it('joins and leaves the most specific tenant-scoped subscription rooms', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    const subscribed = await gateway.handleSubscribe(client as Socket, {
      eventType: 'LEDGER_EVENT',
      subjectType: 'order',
      subjectId: 'order-1',
    });

    expect(subscribed).toMatchObject({
      subscribed: true,
      rooms: [
        `tenant:${tenantId}:subject:order:order-1`,
      ],
      timestamp: expect.any(String),
    });
    expect(client.join).toHaveBeenCalledWith(
      `tenant:${tenantId}:subject:order:order-1`,
    );

    const unsubscribed = await gateway.handleUnsubscribe(client as Socket, {
      eventType: 'LEDGER_EVENT',
      subjectType: 'order',
      subjectId: 'order-1',
    });

    expect(unsubscribed).toMatchObject({
      subscribed: false,
      rooms: [
        `tenant:${tenantId}:subject:order:order-1`,
      ],
      timestamp: expect.any(String),
    });
    expect(client.leave).toHaveBeenCalledWith(
      `tenant:${tenantId}:subject:order:order-1`,
    );
  });

  it('supports wildcard tenant subscriptions with an empty filter', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    const subscribed = await gateway.handleSubscribe(client as Socket, {});

    expect(subscribed).toMatchObject({
      subscribed: true,
      rooms: [`tenant:${tenantId}`],
      timestamp: expect.any(String),
    });
    expect(client.join).toHaveBeenCalledWith(`tenant:${tenantId}`);
  });

  it('rate limits subscription attempts per notification client', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    for (let index = 0; index < 10; index += 1) {
      await expect(
        gateway.handleSubscribe(client as Socket, {
          subjectType: 'order',
          subjectId: `order-${index}`,
        }),
      ).resolves.toMatchObject({ subscribed: true });
    }

    await expect(
      gateway.handleSubscribe(client as Socket, {
        subjectType: 'order',
        subjectId: 'order-10',
      }),
    ).resolves.toMatchObject({
      subscribed: false,
      rooms: [],
      code: 'NOTIFICATION_RATE_LIMITED',
      error: 'Notification subscription rate limit exceeded',
      retryAfterMs: expect.any(Number),
    });
  });

  it('cleans up notification client state and subscription attempts on disconnect', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);

    for (let index = 0; index < 10; index += 1) {
      await gateway.handleSubscribe(client as Socket, {
        subjectType: 'order',
        subjectId: `disconnect-cleanup-${index}`,
      });
    }
    await expect(
      gateway.handleSubscribe(client as Socket, {
        subjectType: 'order',
        subjectId: 'disconnect-cleanup-limited',
      }),
    ).resolves.toMatchObject({ subscribed: false, code: 'NOTIFICATION_RATE_LIMITED' });

    gateway.handleDisconnect(client as Socket);

    await expect(gateway.handleGetStatus(client as Socket)).resolves.toMatchObject({
      connected: false,
      subscriptions: [],
      activeConnections: 0,
    });

    await gateway.handleConnection(client as Socket);

    await expect(
      gateway.handleSubscribe(client as Socket, {
        subjectType: 'order',
        subjectId: 'disconnect-cleanup-reconnected',
      }),
    ).resolves.toMatchObject({
      subscribed: true,
      rooms: [`tenant:${tenantId}:subject:order:disconnect-cleanup-reconnected`],
    });
  });

  it('returns a handler error response when room joins fail', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    (client.join as jest.Mock).mockRejectedValueOnce(new Error('join failed'));
    await gateway.handleConnection(client as Socket);

    await expect(
      gateway.handleSubscribe(client as Socket, {
        eventType: 'LEDGER_EVENT',
      }),
    ).resolves.toMatchObject({
      subscribed: false,
      rooms: [],
      code: 'NOTIFICATION_HANDLER_ERROR',
      error: 'Notification subscription failed',
    });
  });

  it('returns a handler error response when room leaves fail', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);
    await gateway.handleSubscribe(client as Socket, {
      eventType: 'LEDGER_EVENT',
    });
    (client.leave as jest.Mock).mockRejectedValueOnce(new Error('leave failed'));

    await expect(
      gateway.handleUnsubscribe(client as Socket, {
        eventType: 'LEDGER_EVENT',
      }),
    ).resolves.toMatchObject({
      subscribed: false,
      rooms: [],
      code: 'NOTIFICATION_HANDLER_ERROR',
      error: 'Notification unsubscribe failed',
    });
  });

  it('reports authenticated client status and subscriptions', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);
    await gateway.handleConnection(client as Socket);
    await gateway.handleSubscribe(client as Socket, {
      eventType: 'LEDGER_EVENT',
    });

    await expect(gateway.handleGetStatus(client as Socket)).resolves.toMatchObject({
      connected: true,
      clientId: 'notification-socket-1',
      tenantId,
      namespace: '/ws',
      subscriptions: [`tenant:${tenantId}:event_type:LEDGER_EVENT`],
      activeConnections: 1,
      connectedAt: expect.any(String),
      heartbeatIntervalMs: 30_000,
      timestamp: expect.any(String),
    });
  });

  it('responds to heartbeat pings with a timestamped pong', () => {
    expect(gateway.handlePing()).toEqual({
      type: 'heartbeat.pong',
      timestamp: expect.any(String),
    });
  });

  it('waits for authenticated connection state before accepting a subscription', async () => {
    let resolveToken: (value: {
      tokenType: string;
      tenantId: string;
      permissions: string[];
      jti: string;
    }) => void;
    jwtService.verifyAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );
    tokenBlacklistService.isJtiBlacklisted.mockResolvedValue(false);

    const connection = gateway.handleConnection(client as Socket);
    const subscription = gateway.handleSubscribe(client as Socket, {
      eventType: 'LEDGER_EVENT',
    });

    if (!resolveToken) {
      throw new Error('Expected deferred token resolver to be initialized');
    }

    resolveToken({
      tokenType: 'access',
      tenantId,
      permissions: ['ledger.read'],
      jti: 'jti-1',
    });

    await connection;
    await expect(subscription).resolves.toMatchObject({
      subscribed: true,
      rooms: [`tenant:${tenantId}:event_type:LEDGER_EVENT`],
      timestamp: expect.any(String),
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('broadcasts ledger notifications to tenant, event, subject, and actor rooms', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as unknown as { server: Pick<Server, 'to'> }).server = {
      to,
    } as Pick<Server, 'to'>;
    const event = LedgerEventSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'admin',
      subjectType: 'order',
      subjectId: 'order-1',
      payload: { action: 'created' },
      metadata: {
        tenantId,
        requestId: 'request-1',
        correlationId: 'correlation-1',
        payloadHash: 'a'.repeat(64),
        eventHash: 'b'.repeat(64),
        chainSequence: 1,
        result: 'accepted',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      createdAt: '2026-06-25T12:00:00.000Z',
    });

    gateway.emitLedgerEvent(event);

    expect(to).toHaveBeenCalledWith([
      `tenant:${tenantId}`,
      `tenant:${tenantId}:event_type:LEDGER_EVENT`,
      `tenant:${tenantId}:subject:order:order-1`,
      `tenant:${tenantId}:actor:user:admin`,
    ]);
    expect(emit).toHaveBeenCalledWith(
      'notification.created',
      expect.objectContaining({
        event: 'LEDGER_EVENT_CREATED',
        priority: 'high',
        category: 'ledger',
        ledgerEvent: event,
        occurredAt: expect.any(String),
      }),
    );
  });
});
