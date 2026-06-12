import { of } from 'rxjs';
import {
  CreateOrderRequest,
  OrderLedgerEventAction,
} from '@true-north-ledger/order-contracts';
import type { LedgerEventsService } from '../ledger-events/ledger-events.service';
import { LedgerEventEntity } from '../ledger-events/ledger-event.entity';
import { OrderEntity } from './order.entity';
import { OrdersService } from './orders.service';
import type { OrdersGateway } from './orders.gateway';

const tenantId = '00000000-0000-0000-0000-000000000000';
const now = new Date('2026-06-05T12:00:00.000Z');
const actor = { userId: 'admin', actorType: 'user', tenantId } as const;

const createRequest: CreateOrderRequest = {
  customerId: 'customer-100',
  customerName: 'Northwind Receiving',
  customerEmail: 'receiving@example.com',
  items: [
    {
      sku: 'SKU-100',
      name: 'Serialized sensor kit',
      quantity: 2,
      unitPrice: 49.5,
      metadata: { lot: 'LOT-42' },
    },
  ],
  currency: 'USD',
  shippingAddress: {
    line1: '100 Warehouse Way',
    city: 'Austin',
    region: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  metadata: { source: 'unit-test' },
  idempotencyKey: 'order-customer-100-0001',
};

function buildOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    tenantId,
    customerId: 'customer-100',
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    status: 'pending',
    items: createRequest.items,
    totalAmount: '99.00',
    currency: 'USD',
    shippingAddress: createRequest.shippingAddress,
    billingAddress: null,
    metadata: { source: 'unit-test' },
    correlationId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'order-customer-100-0001',
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    ...overrides,
  } as OrderEntity;
}

function buildLedgerEvent(
  overrides: Partial<LedgerEventEntity> = {},
): LedgerEventEntity {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    type: 'LEDGER_EVENT',
    actorType: 'user',
    actorId: 'admin',
    subjectType: 'order',
    subjectId: '33333333-3333-4333-8333-333333333333',
    payload: {
      action: OrderLedgerEventAction.ORDER_CREATED,
      status: 'pending',
      orderNumber: 'ORD-20260605-0001',
      correlationId: '44444444-4444-4444-8444-444444444444',
      actorMetadata: { customerId: 'customer-100' },
    },
    tenantId,
    requestId: 'request-1',
    correlationId: '44444444-4444-4444-8444-444444444444',
    sourceIp: '127.0.0.1',
    userAgent: 'orders-service-spec',
    payloadHash: 'a'.repeat(64),
    previousHash: null,
    eventHash: 'b'.repeat(64),
    chainSequence: '1',
    result: 'accepted',
    timestamp: now,
    createdAt: now,
    ...overrides,
  } as LedgerEventEntity;
}

function awaitSingle<T>(source$: {
  subscribe: (handlers: {
    next(value: T): void;
    error(error: unknown): void;
  }) => void;
}): Promise<T> {
  return new Promise<T>((resolve, reject) =>
    source$.subscribe({
      next: resolve,
      error: reject,
    }),
  );
}

describe('OrdersService', () => {
  let savedOrders: OrderEntity[];
  let service: OrdersService;
  let orderRepository: {
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let ledgerEventRepository: {
    find: jest.Mock;
  };
  let ledgerEventsService: Pick<LedgerEventsService, 'appendEvent'>;
  let ordersGateway: Pick<OrdersGateway, 'emitOrderEvent'>;

  beforeEach(() => {
    savedOrders = [];
    orderRepository = {
      save: jest.fn(async (entity: OrderEntity) => {
        const saved = buildOrder({
          ...entity,
          createdAt: entity.createdAt ?? now,
          updatedAt: now,
        });
        savedOrders.push(saved);
        return saved;
      }),
      findOne: jest.fn(async () => null),
      createQueryBuilder: jest.fn(),
    };
    ledgerEventRepository = {
      find: jest.fn(async () => [buildLedgerEvent()]),
    };
    ledgerEventsService = {
      appendEvent: jest.fn(() =>
        of({
          id: '77777777-7777-4777-8777-777777777777',
          metadata: { timestamp: now.toISOString() },
        }),
      ),
    } as unknown as Pick<LedgerEventsService, 'appendEvent'>;
    ordersGateway = {
      emitOrderEvent: jest.fn(),
    };

    service = new OrdersService(
      orderRepository as never,
      ledgerEventRepository as never,
      ledgerEventsService as LedgerEventsService,
      ordersGateway as OrdersGateway,
    );
  });

  it('creates a pending order, calculates totals, and appends an ORDER_CREATED ledger event', async () => {
    const order = await awaitSingle(
      service.createOrder(createRequest, actor, {
        userAgent: 'orders-service-spec',
        sourceIp: '127.0.0.1',
      }),
    );

    expect(order).toMatchObject({
      customerId: 'customer-100',
      status: 'pending',
      totalAmount: 99,
      currency: 'USD',
    });
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(savedOrders[0]).toMatchObject({
      tenantId,
      status: 'pending',
      totalAmount: '99.00',
      idempotencyKey: 'order-customer-100-0001',
    });
    expect(ordersGateway.emitOrderEvent).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: 'created',
        order: expect.objectContaining({ status: 'pending' }),
      }),
    );
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEDGER_EVENT',
        subjectType: 'order',
        subjectId: order.id,
        payload: expect.objectContaining({
          action: OrderLedgerEventAction.ORDER_CREATED,
          orderNumber: order.orderNumber,
          correlationId: order.correlationId,
          actorMetadata: { customerId: 'customer-100' },
          customerId: 'customer-100',
          totalAmount: 99,
        }),
      }),
      actor,
      tenantId,
      expect.objectContaining({
        correlationId: order.correlationId,
        userAgent: 'orders-service-spec',
      }),
    );
  });

  it('returns an existing order for a repeated idempotency key', async () => {
    const existing = buildOrder();
    orderRepository.findOne.mockResolvedValueOnce(existing);

    const order = await awaitSingle(service.createOrder(createRequest, actor));

    expect(order.id).toBe(existing.id);
    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(ledgerEventsService.appendEvent).not.toHaveBeenCalled();
  });

  it('retries order number generation when a generated number already exists', async () => {
    orderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce(null);

    const order = await awaitSingle(service.createOrder(createRequest, actor));

    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(orderRepository.findOne).toHaveBeenCalledTimes(3);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });

  it('lists tenant orders with filter, search, pagination, and sort query clauses', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[buildOrder()], 6]),
    };
    orderRepository.createQueryBuilder.mockReturnValueOnce(queryBuilder);

    const response = await awaitSingle(
      service.listOrders(tenantId, {
        status: 'pending',
        customerId: 'customer-100',
        query: 'northwind',
        page: 2,
        pageSize: 5,
        sortBy: 'totalAmount',
        sortDirection: 'asc',
      }),
    );

    expect(response).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'order.tenant_id = :tenantId',
      {
        tenantId,
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'order.status = :status',
      {
        status: 'pending',
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'order.customer_id = :customerId',
      {
        customerId: 'customer-100',
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(order.order_number) LIKE :query OR LOWER(order.customer_name) LIKE :query OR LOWER(order.customer_email) LIKE :query OR LOWER(CAST(order.metadata AS TEXT)) LIKE :query)',
      { query: '%northwind%' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'order.total_amount',
      'ASC',
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });

  it('updates status, stamps lifecycle dates, and records status transition details', async () => {
    const existing = buildOrder({ status: 'pending' });
    orderRepository.findOne.mockResolvedValueOnce(existing);

    const updated = await awaitSingle(
      service.updateStatus(
        existing.id,
        tenantId,
        { status: 'confirmed', reason: 'Customer approved' },
        actor,
      ),
    );

    expect(updated.status).toBe('confirmed');
    expect(savedOrders[0].confirmedAt).toBeInstanceOf(Date);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: OrderLedgerEventAction.ORDER_STATUS_CHANGED,
          previousStatus: 'pending',
          status: 'confirmed',
          reason: 'Customer approved',
          actorMetadata: { customerId: 'customer-100' },
          statusAction: OrderLedgerEventAction.ORDER_CONFIRMED,
        }),
      }),
      actor,
      tenantId,
      expect.objectContaining({ correlationId: existing.correlationId }),
    );
  });

  it('rejects invalid status transitions', async () => {
    const existing = buildOrder({ status: 'delivered' });
    orderRepository.findOne.mockResolvedValueOnce(existing);

    await expect(
      awaitSingle(
        service.updateStatus(
          existing.id,
          tenantId,
          { status: 'pending', reason: 'Bad rewind' },
          actor,
        ),
      ),
    ).rejects.toThrow('Invalid order status transition: delivered -> pending');
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('cancels cancellable orders and blocks shipped cancellation', async () => {
    const pending = buildOrder({ status: 'pending' });
    orderRepository.findOne.mockResolvedValueOnce(pending);

    const cancelled = await awaitSingle(
      service.cancelOrder(
        pending.id,
        tenantId,
        { reason: 'Customer request' },
        actor,
      ),
    );

    expect(cancelled.status).toBe('cancelled');
    expect(savedOrders[0].cancelledAt).toBeInstanceOf(Date);
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: OrderLedgerEventAction.ORDER_CANCELLED,
          reason: 'Customer request',
        }),
      }),
      actor,
      tenantId,
      expect.any(Object),
    );

    orderRepository.findOne.mockResolvedValueOnce(
      buildOrder({ status: 'shipped' }),
    );
    await expect(
      awaitSingle(
        service.cancelOrder(
          pending.id,
          tenantId,
          { reason: 'Too late' },
          actor,
        ),
      ),
    ).rejects.toThrow('Invalid order status transition: shipped -> cancelled');
  });

  it('builds timeline and proof from correlated ledger events', async () => {
    const order = buildOrder();
    orderRepository.findOne.mockResolvedValueOnce(order);
    ledgerEventRepository.find.mockResolvedValueOnce([
      buildLedgerEvent(),
      buildLedgerEvent({
        id: '66666666-6666-4666-8666-666666666666',
        payload: {
          action: OrderLedgerEventAction.ORDER_STATUS_CHANGED,
          previousStatus: 'pending',
          status: 'confirmed',
          reason: 'Customer approved',
        },
        timestamp: new Date('2026-06-05T12:05:00.000Z'),
        createdAt: new Date('2026-06-05T12:05:00.000Z'),
      }),
    ]);

    const proof = await awaitSingle(service.getProof(order.id, tenantId));
    const verification = await awaitSingle(service.verifyProof(proof));

    expect(proof).toMatchObject({
      orderId: order.id,
      orderNumber: order.orderNumber,
      correlationId: order.correlationId,
      generator: 'ledger-api',
    });
    expect(proof.events).toHaveLength(2);
    expect(proof.events[1]).toMatchObject({
      eventType: OrderLedgerEventAction.ORDER_STATUS_CHANGED,
      actorMetadata: { customerId: 'customer-100' },
      previousStatus: 'pending',
      status: 'confirmed',
    });
    expect(verification.valid).toBe(true);
    expect(ledgerEventRepository.find).toHaveBeenCalledWith({
      where: { tenantId, correlationId: order.correlationId },
      order: { createdAt: 'ASC' },
    });
  });

  it('rejects proof verification when the event chain is inconsistent', async () => {
    const order = buildOrder();
    orderRepository.findOne.mockResolvedValueOnce(order);
    ledgerEventRepository.find.mockResolvedValueOnce([
      buildLedgerEvent(),
      buildLedgerEvent({
        id: '66666666-6666-4666-8666-666666666666',
        payload: {
          action: OrderLedgerEventAction.ORDER_STATUS_CHANGED,
          previousStatus: 'pending',
          status: 'confirmed',
        },
        timestamp: new Date('2026-06-05T12:05:00.000Z'),
        createdAt: new Date('2026-06-05T12:05:00.000Z'),
      }),
    ]);

    const proof = await awaitSingle(service.getProof(order.id, tenantId));
    const verification = await awaitSingle(
      service.verifyProof({
        ...proof,
        events: [
          proof.events[1],
          {
            ...proof.events[0],
            timestamp: '2026-06-05T12:10:00.000Z',
          },
        ],
      }),
    );

    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe(
      'Proof event chain must start with ORDER_CREATED',
    );
  });
});
