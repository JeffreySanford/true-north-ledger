import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  Ack,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { JwtPayload } from '../auth/auth.dto';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import type { OrderRealtimeEvent } from '@true-north-ledger/order-contracts';
import type { Server, Socket } from 'socket.io';
import { createWebSocketCorsOptions } from '../config/websocket-cors.config';

interface OrderSocketState {
  clientId: string;
  tenantId: string;
  permissions: string[];
  connectedAt: string;
  subscriptions: string[];
  socket: Socket;
}

export interface OrderSocketStatusResponse {
  connected: boolean;
  clientId: string;
  tenantId?: string;
  namespace: '/orders';
  subscriptions: string[];
  activeConnections: number;
  connectedAt?: string;
  heartbeatIntervalMs: number;
  timestamp: string;
}

export interface OrderSocketPongResponse {
  event: 'pong';
  timestamp: string;
}

@WebSocketGateway({
  namespace: '/orders',
  cors: createWebSocketCorsOptions(),
})
export class OrdersGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private static readonly heartbeatIntervalMs = 30_000;
  private static readonly heartbeatAckTimeoutMs = 5_000;

  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(OrdersGateway.name);
  private readonly connectedClients = new Map<string, OrderSocketState>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  afterInit(): void {
    this.heartbeatTimer ??= setInterval(
      () => this.sendHeartbeat(),
      OrdersGateway.heartbeatIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token = this.readToken(client);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (
        payload.tokenType !== 'access' ||
        !payload.tenantId ||
        !this.canReadOrders(payload.permissions ?? [])
      ) {
        throw new Error('Invalid order socket token');
      }
      if (
        payload.jti &&
        (await this.tokenBlacklistService.isJtiBlacklisted(payload.jti))
      ) {
        throw new Error('Order socket token revoked');
      }

      await client.join(this.tenantRoom(payload.tenantId));
      this.connectedClients.set(client.id, {
        clientId: client.id,
        tenantId: payload.tenantId,
        permissions: payload.permissions ?? [],
        connectedAt: new Date().toISOString(),
        subscriptions: [this.tenantRoom(payload.tenantId)],
        socket: client,
      });
      this.logger.log(`Accepted order socket ${client.id}`);
    } catch {
      this.logger.warn(`Rejected unauthenticated order socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(`Disconnected order socket ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(
    @Ack() acknowledge?: (response: OrderSocketPongResponse) => void,
  ): OrderSocketPongResponse | void {
    const response: OrderSocketPongResponse = {
      event: 'pong',
      timestamp: new Date().toISOString(),
    };
    if (acknowledge) {
      acknowledge(response);
      return;
    }

    return response;
  }

  @SubscribeMessage('get_status')
  handleGetStatus(
    @ConnectedSocket() client: Socket,
  ): OrderSocketStatusResponse {
    const state = this.connectedClients.get(client.id);

    return {
      connected: Boolean(state),
      clientId: client.id,
      tenantId: state?.tenantId,
      namespace: '/orders',
      subscriptions: state?.subscriptions ?? [],
      activeConnections: this.getActiveConnectionCount(),
      connectedAt: state?.connectedAt,
      heartbeatIntervalMs: OrdersGateway.heartbeatIntervalMs,
      timestamp: new Date().toISOString(),
    };
  }

  emitOrderEvent(tenantId: string, event: OrderRealtimeEvent): void {
    this.server.to(this.tenantRoom(tenantId)).emit('order.updated', event);
  }

  getActiveConnectionCount(): number {
    return this.connectedClients.size;
  }

  private readToken(client: Socket): string {
    const authToken = client.handshake.auth?.['token'];
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }

    const authorization = client.handshake.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }

    throw new Error('Missing order socket token');
  }

  private canReadOrders(permissions: string[]): boolean {
    return permissions.includes('admin') || permissions.includes('orders.read');
  }

  private tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  private sendHeartbeat(): void {
    for (const [clientId, state] of this.connectedClients.entries()) {
      state.socket
        .timeout(OrdersGateway.heartbeatAckTimeoutMs)
        .emit(
          'heartbeat.ping',
          { timestamp: new Date().toISOString() },
          (error: Error | null, response?: { event?: string }) => {
            if (error || response?.event !== 'heartbeat.pong') {
              this.logger.warn(`Disconnecting unresponsive order socket ${clientId}`);
              this.connectedClients.delete(clientId);
              state.socket.disconnect(true);
            }
          },
        );
    }
  }
}
