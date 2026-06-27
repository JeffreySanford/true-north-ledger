import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  LedgerEventResponse,
  LedgerNotification,
} from '@true-north-ledger/shared-models';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/auth.dto';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { createWebSocketCorsOptions } from '../config/websocket-cors.config';

interface NotificationSocketState {
  clientId: string;
  tenantId: string;
  permissions: string[];
  subscriptions: string[];
  connectedAt: string;
}

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
  error?: string;
  code?: 'NOTIFICATION_RATE_LIMITED' | 'NOTIFICATION_HANDLER_ERROR';
  retryAfterMs?: number;
}

export interface NotificationPongResponse {
  type: 'heartbeat.pong';
  timestamp: string;
}

export interface NotificationStatusResponse {
  connected: boolean;
  clientId: string;
  tenantId?: string;
  namespace: '/ws';
  subscriptions: string[];
  activeConnections: number;
  connectedAt?: string;
  heartbeatIntervalMs: number;
  timestamp: string;
}

@WebSocketGateway({
  namespace: '/ws',
  cors: createWebSocketCorsOptions(),
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private static readonly heartbeatIntervalMs = 30_000;
  private static readonly subscriptionRateLimitWindowMs = 10_000;
  private static readonly subscriptionRateLimitMax = 10;

  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly connectedClients = new Map<string, NotificationSocketState>();
  private readonly subscriptionAttempts = new Map<string, number[]>();

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
        !this.canReadLedger(payload.permissions ?? [])
      ) {
        throw new Error('Invalid notification socket token');
      }
      if (
        payload.jti &&
        (await this.tokenBlacklistService.isJtiBlacklisted(payload.jti))
      ) {
        throw new Error('Notification socket token revoked');
      }

      this.connectedClients.set(client.id, {
        clientId: client.id,
        tenantId: payload.tenantId,
        permissions: payload.permissions ?? [],
        subscriptions: [],
        connectedAt: new Date().toISOString(),
      });
      this.logger.log(`Accepted notification socket ${client.id}`);
    } catch {
      this.logger.warn(`Rejected notification socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.connectedClients.delete(client.id);
    this.subscriptionAttempts.delete(client.id);
    this.logger.log(`Disconnected notification socket ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() filter: NotificationSubscriptionFilter = {},
  ): Promise<NotificationSubscriptionResponse> {
    try {
      const rateLimit = this.recordSubscriptionAttempt(client.id);
      if (rateLimit.limited) {
        return this.subscriptionResponse(false, [], {
          code: 'NOTIFICATION_RATE_LIMITED',
          error: 'Notification subscription rate limit exceeded',
          retryAfterMs: rateLimit.retryAfterMs,
        });
      }

      const state = await this.waitForClientState(client.id);
      if (!state) {
        client.disconnect(true);
        return this.subscriptionResponse(false, []);
      }

      const rooms = this.roomsForFilter(state.tenantId, filter);
      for (const room of rooms) {
        await client.join(room);
      }
      state.subscriptions = [...new Set([...state.subscriptions, ...rooms])];

      return this.subscriptionResponse(true, rooms);
    } catch (error) {
      this.logger.warn(
        `Failed notification subscription for ${client.id}: ${this.errorMessage(error)}`,
      );
      return this.subscriptionResponse(false, [], {
        code: 'NOTIFICATION_HANDLER_ERROR',
        error: 'Notification subscription failed',
      });
    }
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() filter: NotificationSubscriptionFilter = {},
  ): Promise<NotificationSubscriptionResponse> {
    try {
      const state = await this.waitForClientState(client.id);
      if (!state) {
        client.disconnect(true);
        return this.subscriptionResponse(false, []);
      }

      const rooms = this.roomsForFilter(state.tenantId, filter).filter(
        (room) => room !== this.tenantRoom(state.tenantId),
      );
      for (const room of rooms) {
        await client.leave(room);
      }
      state.subscriptions = state.subscriptions.filter(
        (room) => !rooms.includes(room),
      );

      return this.subscriptionResponse(false, rooms);
    } catch (error) {
      this.logger.warn(
        `Failed notification unsubscribe for ${client.id}: ${this.errorMessage(error)}`,
      );
      return this.subscriptionResponse(false, [], {
        code: 'NOTIFICATION_HANDLER_ERROR',
        error: 'Notification unsubscribe failed',
      });
    }
  }

  @SubscribeMessage('heartbeat.ping')
  handlePing(): NotificationPongResponse {
    return {
      type: 'heartbeat.pong',
      timestamp: new Date().toISOString(),
    };
  }

  @SubscribeMessage('get_status')
  async handleGetStatus(
    @ConnectedSocket() client: Socket,
  ): Promise<NotificationStatusResponse> {
    const state = await this.waitForClientState(client.id);

    return {
      connected: Boolean(state),
      clientId: client.id,
      tenantId: state?.tenantId,
      namespace: '/ws',
      subscriptions: state?.subscriptions ?? [],
      activeConnections: this.getActiveConnectionCount(),
      connectedAt: state?.connectedAt,
      heartbeatIntervalMs: NotificationsGateway.heartbeatIntervalMs,
      timestamp: new Date().toISOString(),
    };
  }

  emitLedgerEvent(event: LedgerEventResponse): void {
    const notification: LedgerNotification = {
      event: 'LEDGER_EVENT_CREATED',
      priority: this.priorityForEvent(event),
      category: 'ledger',
      ledgerEvent: event,
      occurredAt: new Date().toISOString(),
    };

    this.server
      .to(this.roomsForLedgerEvent(event))
      .emit('notification.created', notification);
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

    throw new Error('Missing notification socket token');
  }

  private canReadLedger(permissions: string[]): boolean {
    return permissions.includes('admin') || permissions.includes('ledger.read');
  }

  private roomsForFilter(
    tenantId: string,
    filter: NotificationSubscriptionFilter,
  ): string[] {
    const rooms: string[] = [];
    if (filter.subjectType && filter.subjectId) {
      rooms.push(
        this.subjectRoom(tenantId, filter.subjectType, filter.subjectId),
      );
    }
    if (filter.actorType && filter.actorId) {
      rooms.push(this.actorRoom(tenantId, filter.actorType, filter.actorId));
    }
    if (rooms.length === 0 && filter.eventType) {
      rooms.push(this.eventTypeRoom(tenantId, filter.eventType));
    }
    if (rooms.length === 0) {
      rooms.push(this.tenantRoom(tenantId));
    }

    return rooms;
  }

  private async waitForClientState(
    clientId: string,
  ): Promise<NotificationSocketState | undefined> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = this.connectedClients.get(clientId);
      if (state) {
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return undefined;
  }

  private roomsForLedgerEvent(event: LedgerEventResponse): string[] {
    return [
      this.tenantRoom(event.metadata.tenantId),
      this.eventTypeRoom(event.metadata.tenantId, event.type),
      this.subjectRoom(
        event.metadata.tenantId,
        event.subjectType,
        event.subjectId,
      ),
      this.actorRoom(event.metadata.tenantId, event.actorType, event.actorId),
    ];
  }

  private priorityForEvent(
    event: LedgerEventResponse,
  ): LedgerNotification['priority'] {
    if (
      event.subjectType === 'order' ||
      event.subjectType === 'inventory_anomaly'
    ) {
      return 'high';
    }
    if (event.subjectType === 'device') {
      return 'normal';
    }
    return 'low';
  }

  private tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  private eventTypeRoom(tenantId: string, eventType: string): string {
    return `tenant:${tenantId}:event_type:${eventType}`;
  }

  private subjectRoom(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): string {
    return `tenant:${tenantId}:subject:${subjectType}:${subjectId}`;
  }

  private actorRoom(
    tenantId: string,
    actorType: string,
    actorId: string,
  ): string {
    return `tenant:${tenantId}:actor:${actorType}:${actorId}`;
  }

  private subscriptionResponse(
    subscribed: boolean,
    rooms: string[],
    errorDetails: Pick<
      NotificationSubscriptionResponse,
      'code' | 'error' | 'retryAfterMs'
    > = {},
  ): NotificationSubscriptionResponse {
    return {
      subscribed,
      rooms,
      timestamp: new Date().toISOString(),
      ...errorDetails,
    };
  }

  private recordSubscriptionAttempt(
    clientId: string,
  ): { limited: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const windowStart = now - NotificationsGateway.subscriptionRateLimitWindowMs;
    const attempts = (this.subscriptionAttempts.get(clientId) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );

    if (attempts.length >= NotificationsGateway.subscriptionRateLimitMax) {
      const retryAfterMs = Math.max(
        1,
        NotificationsGateway.subscriptionRateLimitWindowMs - (now - attempts[0]),
      );
      this.subscriptionAttempts.set(clientId, attempts);
      return { limited: true, retryAfterMs };
    }

    attempts.push(now);
    this.subscriptionAttempts.set(clientId, attempts);
    return { limited: false };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
