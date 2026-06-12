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
  let client: Pick<Socket, 'id' | 'handshake' | 'join' | 'disconnect'>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    gateway = new OrdersGateway(
      jwtService as unknown as JwtService,
      tokenBlacklistService as unknown as TokenBlacklistService,
    );
    client = {
      id: 'socket-1',
      handshake: {
        auth: { token: 'access-token' },
        headers: {},
      } as Socket['handshake'],
      join: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('joins authenticated order readers to their tenant room', async () => {
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
