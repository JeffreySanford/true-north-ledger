import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, randomUUID } from 'crypto';
import { FindOptionsWhere, Repository } from 'typeorm';
import { from, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import {
  CreateOrderRequest,
  Order,
  OrderCancelRequest,
  OrderDetailResponse,
  OrderLedgerEventAction,
  OrderListResponse,
  OrderProof,
  OrderProofVerificationResponse,
  OrderSearchRequest,
  OrderStatus,
  OrderStatusUpdateRequest,
  OrderTimelineEvent,
} from '@true-north-ledger/order-contracts';
import {
  AuthenticatedLedgerActor,
  LedgerEventsService,
  LedgerRequestContext,
} from '../ledger-events/ledger-events.service';
import { LedgerEventEntity } from '../ledger-events/ledger-event.entity';
import { OrderEntity } from './order.entity';
import { OrdersGateway } from './orders.gateway';

const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled', 'failed'],
  confirmed: ['processing', 'cancelled', 'failed'],
  processing: ['shipped', 'cancelled', 'failed'],
  shipped: ['delivered', 'failed'],
  delivered: [],
  cancelled: [],
  failed: [],
};

const STATUS_TIMESTAMPS: Partial<Record<OrderStatus, keyof OrderEntity>> = {
  confirmed: 'confirmedAt',
  shipped: 'shippedAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(LedgerEventEntity)
    private readonly ledgerEventRepository: Repository<LedgerEventEntity>,
    private readonly ledgerEventsService: LedgerEventsService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  createOrder(
    request: CreateOrderRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<Order> {
    return from(this.persistOrder(request, actor, requestContext)).pipe(
      map((entity) => this.toOrder(entity)),
      tap((order) => this.emitOrderUpdate('created', order)),
    );
  }

  listOrders(
    tenantId: string,
    filters: Partial<OrderSearchRequest> = {},
  ): Observable<OrderListResponse> {
    return from(this.findOrders(tenantId, filters)).pipe(
      map(([entities, total]) => ({
        orders: entities.map((entity) => this.toOrderSummary(entity)),
        total,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 25,
      })),
    );
  }

  getOrder(id: string, tenantId: string): Observable<OrderDetailResponse> {
    return from(this.getOrderDetail(id, tenantId));
  }

  getOrderByNumber(
    orderNumber: string,
    tenantId: string,
  ): Observable<OrderDetailResponse> {
    return from(this.getOrderDetailByNumber(orderNumber, tenantId));
  }

  updateStatus(
    id: string,
    tenantId: string,
    request: OrderStatusUpdateRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<Order> {
    return from(
      this.changeStatus(id, tenantId, request, actor, requestContext),
    ).pipe(
      map((entity) => this.toOrder(entity)),
      tap((order) => this.emitOrderUpdate('status_changed', order)),
    );
  }

  cancelOrder(
    id: string,
    tenantId: string,
    request: OrderCancelRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<Order> {
    return from(
      this.changeStatus(
        id,
        tenantId,
        { status: 'cancelled', reason: request.reason },
        actor,
        requestContext,
      ),
    ).pipe(
      map((entity) => this.toOrder(entity)),
      tap((order) => this.emitOrderUpdate('cancelled', order)),
    );
  }

  getTimeline(id: string, tenantId: string): Observable<OrderTimelineEvent[]> {
    return from(
      this.findTenantOrder(id, tenantId).then((entity) =>
        this.buildTimeline(entity),
      ),
    );
  }

  getProof(id: string, tenantId: string): Observable<OrderProof> {
    return from(this.buildProof(id, tenantId));
  }

  verifyProof(proof: OrderProof): Observable<OrderProofVerificationResponse> {
    const chainFailure = this.validateProofEventChain(proof);
    const proofHash = this.computeProofHash({
      orderId: proof.orderId,
      orderNumber: proof.orderNumber,
      correlationId: proof.correlationId,
      events: proof.events,
    });
    const valid = proofHash === proof.proofHash && !chainFailure;

    return from(
      Promise.resolve({
        valid,
        proofHash,
        verifiedAt: new Date().toISOString(),
        ...(!valid
          ? {
              reason:
                chainFailure ??
                'Proof hash does not match canonical proof payload',
            }
          : {}),
      }),
    );
  }

  private emitOrderUpdate(
    type: 'created' | 'status_changed' | 'cancelled',
    order: Order,
  ): void {
    this.ordersGateway.emitOrderEvent(order.tenantId, {
      type,
      order,
      occurredAt: new Date().toISOString(),
    });
  }

  private async persistOrder(
    request: CreateOrderRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<OrderEntity> {
    if (request.idempotencyKey) {
      const existing = await this.orderRepository.findOne({
        where: {
          tenantId: actor.tenantId,
          idempotencyKey: request.idempotencyKey,
        },
      });
      if (existing) {
        return existing;
      }
    }

    const entity = new OrderEntity();
    entity.id = randomUUID();
    entity.orderNumber = await this.generateOrderNumber();
    entity.tenantId = actor.tenantId;
    entity.customerId = request.customerId;
    entity.customerName = request.customerName;
    entity.customerEmail = request.customerEmail ?? null;
    entity.status = 'pending';
    entity.items = request.items;
    entity.totalAmount = this.calculateTotalAmount(request.items).toFixed(2);
    entity.currency = request.currency;
    entity.shippingAddress = request.shippingAddress;
    entity.billingAddress = request.billingAddress ?? null;
    entity.metadata = request.metadata ?? {};
    entity.correlationId = randomUUID();
    entity.idempotencyKey = request.idempotencyKey ?? null;
    entity.confirmedAt = null;
    entity.shippedAt = null;
    entity.deliveredAt = null;
    entity.cancelledAt = null;

    try {
      const saved = await this.orderRepository.save(entity);
      await this.appendOrderEvent(
        saved,
        OrderLedgerEventAction.ORDER_CREATED,
        actor,
        requestContext,
        {
          status: saved.status,
          totalAmount: this.parseMoney(saved.totalAmount),
          customerId: saved.customerId,
        },
      );
      return saved;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Order number or idempotency key already exists',
        );
      }
      throw error;
    }
  }

  private async getOrderDetail(
    id: string,
    tenantId: string,
  ): Promise<OrderDetailResponse> {
    const entity = await this.findTenantOrder(id, tenantId);
    return {
      ...this.toOrder(entity),
      timeline: await this.buildTimeline(entity),
    };
  }

  private async getOrderDetailByNumber(
    orderNumber: string,
    tenantId: string,
  ): Promise<OrderDetailResponse> {
    const entity = await this.findTenantOrderByNumber(orderNumber, tenantId);
    return {
      ...this.toOrder(entity),
      timeline: await this.buildTimeline(entity),
    };
  }

  private async findOrders(
    tenantId: string,
    filters: Partial<OrderSearchRequest>,
  ): Promise<[OrderEntity[], number]> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const query = this.orderRepository
      .createQueryBuilder('order')
      .where('order.tenant_id = :tenantId', { tenantId });

    if (filters.status) {
      query.andWhere('order.status = :status', { status: filters.status });
    }

    if (filters.customerId) {
      query.andWhere('order.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    }

    if (filters.query) {
      query.andWhere(
        '(LOWER(order.order_number) LIKE :query OR LOWER(order.customer_name) LIKE :query OR LOWER(order.customer_email) LIKE :query OR LOWER(CAST(order.metadata AS TEXT)) LIKE :query)',
        { query: `%${filters.query.toLowerCase()}%` },
      );
    }

    if (filters.createdFrom) {
      query.andWhere('order.created_at >= :createdFrom', {
        createdFrom: filters.createdFrom,
      });
    }

    if (filters.createdTo) {
      query.andWhere('order.created_at <= :createdTo', {
        createdTo: filters.createdTo,
      });
    }

    const sortColumn =
      filters.sortBy === 'totalAmount'
        ? 'order.total_amount'
        : 'order.created_at';
    query.orderBy(sortColumn, filters.sortDirection === 'asc' ? 'ASC' : 'DESC');
    query.skip((page - 1) * pageSize);
    query.take(pageSize);

    return query.getManyAndCount();
  }

  private async findTenantOrder(
    id: string,
    tenantId: string,
  ): Promise<OrderEntity> {
    const entity = await this.orderRepository.findOne({
      where: { id, tenantId },
    });
    if (!entity) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return entity;
  }

  private async findTenantOrderByNumber(
    orderNumber: string,
    tenantId: string,
  ): Promise<OrderEntity> {
    const entity = await this.orderRepository.findOne({
      where: { orderNumber, tenantId },
    });
    if (!entity) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }
    return entity;
  }

  private async changeStatus(
    id: string,
    tenantId: string,
    request: OrderStatusUpdateRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<OrderEntity> {
    const entity = await this.findTenantOrder(id, tenantId);
    this.assertValidTransition(entity.status, request.status);

    const previousStatus = entity.status;
    entity.status = request.status;
    const timestampColumn = STATUS_TIMESTAMPS[request.status];
    if (timestampColumn) {
      (entity[timestampColumn] as Date | null | undefined) = new Date();
    }

    const saved = await this.orderRepository.save(entity);
    const action =
      request.status === 'cancelled'
        ? OrderLedgerEventAction.ORDER_CANCELLED
        : OrderLedgerEventAction.ORDER_STATUS_CHANGED;

    await this.appendOrderEvent(saved, action, actor, requestContext, {
      previousStatus,
      status: request.status,
      reason: request.reason,
      customerId: saved.customerId,
      statusAction: this.statusAction(request.status),
    });

    return saved;
  }

  private assertValidTransition(from: OrderStatus, to: OrderStatus): void {
    if (from === to) {
      throw new BadRequestException(`Order is already ${to}`);
    }

    if (!VALID_STATUS_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Invalid order status transition: ${from} -> ${to}`,
      );
    }
  }

  private async buildTimeline(
    entity: OrderEntity,
  ): Promise<OrderTimelineEvent[]> {
    const events = await this.ledgerEventRepository.find({
      where: { tenantId: entity.tenantId, correlationId: entity.correlationId },
      order: { createdAt: 'ASC' },
    });

    return events
      .filter((event) => event.subjectType === 'order')
      .map((event) => this.toTimelineEvent(entity, event));
  }

  private async buildProof(id: string, tenantId: string): Promise<OrderProof> {
    const entity = await this.findTenantOrder(id, tenantId);
    const events = await this.buildTimeline(entity);
    if (events.length === 0) {
      throw new NotFoundException(`No ledger events found for order ${id}`);
    }

    const canonicalProof = {
      orderId: entity.id,
      orderNumber: entity.orderNumber,
      correlationId: entity.correlationId,
      events,
    };

    return {
      ...canonicalProof,
      generatedAt: new Date().toISOString(),
      generator: 'ledger-api',
      proofHash: this.computeProofHash(canonicalProof),
    };
  }

  private toTimelineEvent(
    entity: OrderEntity,
    event: LedgerEventEntity,
  ): OrderTimelineEvent {
    const payload = event.payload as {
      action?: OrderLedgerEventAction;
      actorMetadata?: {
        customerId?: string;
      };
      previousStatus?: OrderStatus;
      status?: OrderStatus;
      reason?: string;
    };

    return {
      eventId: event.id,
      eventType: payload.action ?? OrderLedgerEventAction.ORDER_STATUS_CHANGED,
      orderId: entity.id,
      orderNumber: entity.orderNumber,
      correlationId: entity.correlationId,
      actorMetadata: {
        customerId: payload.actorMetadata?.customerId ?? entity.customerId,
      },
      previousStatus: payload.previousStatus,
      status: payload.status,
      reason: payload.reason,
      actorType: event.actorType as OrderTimelineEvent['actorType'],
      actorId: event.actorId,
      result: event.result as OrderTimelineEvent['result'],
      timestamp: event.timestamp.toISOString(),
    };
  }

  private async appendOrderEvent(
    entity: OrderEntity,
    action: OrderLedgerEventAction,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.awaitObservable(
      this.ledgerEventsService.appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'order',
          subjectId: entity.id,
          payload: {
            action,
            orderId: entity.id,
            orderNumber: entity.orderNumber,
            correlationId: entity.correlationId,
            actorMetadata: {
              customerId: entity.customerId,
            },
            ...details,
          },
        },
        actor,
        entity.tenantId,
        {
          ...requestContext,
          correlationId: entity.correlationId,
        },
      ),
    );
  }

  private async generateOrderNumber(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sequence = String(randomInt(0, 10_000)).padStart(4, '0');
      const orderNumber = `ORD-${datePart}-${sequence}`;
      const existing = await this.orderRepository.findOne({
        where: { orderNumber } as FindOptionsWhere<OrderEntity>,
      });
      if (!existing) {
        return orderNumber;
      }
    }

    throw new ConflictException('Unable to generate a unique order number');
  }

  private calculateTotalAmount(items: CreateOrderRequest['items']): number {
    return (
      Math.round(
        items.reduce(
          (total, item) => total + item.quantity * item.unitPrice,
          0,
        ) * 100,
      ) / 100
    );
  }

  private statusAction(
    status: OrderStatus,
  ): OrderLedgerEventAction | undefined {
    const actions: Partial<Record<OrderStatus, OrderLedgerEventAction>> = {
      confirmed: OrderLedgerEventAction.ORDER_CONFIRMED,
      processing: OrderLedgerEventAction.ORDER_PROCESSING,
      shipped: OrderLedgerEventAction.ORDER_SHIPPED,
      delivered: OrderLedgerEventAction.ORDER_DELIVERED,
      cancelled: OrderLedgerEventAction.ORDER_CANCELLED,
    };

    return actions[status];
  }

  private toOrder(entity: OrderEntity): Order {
    return {
      id: entity.id,
      orderNumber: entity.orderNumber,
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      customerName: entity.customerName,
      customerEmail: entity.customerEmail ?? null,
      status: entity.status,
      items: entity.items,
      totalAmount: this.parseMoney(entity.totalAmount),
      currency: entity.currency,
      shippingAddress: entity.shippingAddress,
      billingAddress: entity.billingAddress ?? null,
      metadata: entity.metadata ?? {},
      correlationId: entity.correlationId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      confirmedAt: entity.confirmedAt?.toISOString() ?? null,
      shippedAt: entity.shippedAt?.toISOString() ?? null,
      deliveredAt: entity.deliveredAt?.toISOString() ?? null,
      cancelledAt: entity.cancelledAt?.toISOString() ?? null,
    };
  }

  private toOrderSummary(
    entity: OrderEntity,
  ): OrderListResponse['orders'][number] {
    const order = this.toOrder(entity);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      tenantId: order.tenantId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      status: order.status,
      totalAmount: order.totalAmount,
      currency: order.currency,
      correlationId: order.correlationId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      confirmedAt: order.confirmedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
    };
  }

  private parseMoney(value: string | number): number {
    return Number(Number(value).toFixed(2));
  }

  private computeProofHash(payload: unknown): string {
    return createHash('sha256')
      .update(this.canonicalize(payload))
      .digest('hex');
  }

  private validateProofEventChain(proof: OrderProof): string | undefined {
    if (proof.events.length === 0) {
      return 'Proof contains no events';
    }

    for (let index = 0; index < proof.events.length; index += 1) {
      const event = proof.events[index];
      if (event.orderId !== proof.orderId) {
        return `Proof event ${event.eventId} does not match proof order id`;
      }
      if (event.orderNumber !== proof.orderNumber) {
        return `Proof event ${event.eventId} does not match proof order number`;
      }
      if (event.correlationId !== proof.correlationId) {
        return `Proof event ${event.eventId} does not match proof correlation id`;
      }
      if (index > 0) {
        const previous = proof.events[index - 1];
        if (new Date(event.timestamp).getTime() < new Date(previous.timestamp).getTime()) {
          return `Proof event ${event.eventId} is out of chronological order`;
        }
      }
    }

    if (proof.events[0].eventType !== OrderLedgerEventAction.ORDER_CREATED) {
      return 'Proof event chain must start with ORDER_CREATED';
    }

    return undefined;
  }

  private canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalize(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.canonicalize(record[key])}`)
      .join(',')}}`;
  }

  private awaitObservable<T>(source: Observable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let resolved = false;
      source.subscribe({
        next: (value) => {
          if (!resolved) {
            resolved = true;
            resolve(value);
          }
        },
        error: reject,
        complete: () => {
          if (!resolved) {
            reject(new Error('Observable completed without a value'));
          }
        },
      });
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
