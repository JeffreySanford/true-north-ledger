import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { JwtPayload } from '../auth/auth.dto';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import type { OrderRealtimeEvent } from '@true-north-ledger/order-contracts';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/orders',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200' },
})
export class OrdersGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

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
    } catch {
      this.logger.warn(`Rejected unauthenticated order socket ${client.id}`);
      client.disconnect(true);
    }
  }

  emitOrderEvent(tenantId: string, event: OrderRealtimeEvent): void {
    this.server.to(this.tenantRoom(tenantId)).emit('order.updated', event);
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
}
