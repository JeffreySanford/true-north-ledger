import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Order, OrderDetailResponse, OrderProof, OrderTimelineEvent } from '@true-north-ledger/order-contracts';
import { OrdersService } from './orders.service';

const now = '2026-06-05T12:00:00.000Z';
const tenantId = '11111111-1111-4111-8111-111111111111';
const orderId = '33333333-3333-4333-8333-333333333333';
const correlationId = '44444444-4444-4444-8444-444444444444';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    orderNumber: 'ORD-20260605-0001',
    tenantId,
    customerId: 'customer-100',
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    status: 'pending',
    items: [
      {
        sku: 'SKU-100',
        name: 'Serialized sensor kit',
        quantity: 2,
        unitPrice: 49.5,
      },
    ],
    totalAmount: 99,
    currency: 'USD',
    shippingAddress: {
      line1: '100 Warehouse Way',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    billingAddress: null,
    metadata: {},
    correlationId,
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function buildTimelineEvent(overrides: Partial<OrderTimelineEvent> = {}): OrderTimelineEvent {
  return {
    eventId: '55555555-5555-4555-8555-555555555555',
    eventType: 'ORDER_CREATED',
    orderId,
    orderNumber: 'ORD-20260605-0001',
    correlationId,
    actorMetadata: { customerId: 'customer-100' },
    status: 'pending',
    actorType: 'user',
    actorId: 'admin',
    result: 'accepted',
    timestamp: now,
    ...overrides,
  };
}

function buildOrderDetail(overrides: Partial<OrderDetailResponse> = {}): OrderDetailResponse {
  return {
    ...buildOrder(overrides),
    timeline: [buildTimelineEvent()],
    ...overrides,
  };
}

function buildProof(overrides: Partial<OrderProof> = {}): OrderProof {
  return {
    orderId,
    orderNumber: 'ORD-20260605-0001',
    correlationId,
    generatedAt: now,
    generator: 'ledger-api',
    events: [buildTimelineEvent()],
    proofHash: 'hash-123',
    ...overrides,
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('tnl.authToken', 'order-auth-token');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [OrdersService],
    });

    service = TestBed.inject(OrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('tnl.authToken');
    http.verify();
  });

  it('lists orders with filters and validates response shape', () => {
    let response: unknown;

    service
      .listOrders({ status: 'pending', query: 'north', customerId: 'customer-100', page: 2, pageSize: 5 })
      .subscribe((result) => {
        response = result;
      });

    const request = http.expectOne('/api/v1/orders?status=pending&query=north&customerId=customer-100&page=2&pageSize=5');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer order-auth-token');
    request.flush({ orders: [buildOrder()], total: 6, page: 2, pageSize: 5 });

    expect(response).toEqual({
      orders: [
        {
          id: orderId,
          orderNumber: 'ORD-20260605-0001',
          tenantId,
          customerId: 'customer-100',
          customerName: 'Northwind Receiving',
          customerEmail: 'receiving@example.com',
          status: 'pending',
          totalAmount: 99,
          currency: 'USD',
          correlationId,
          createdAt: now,
          updatedAt: now,
          confirmedAt: null,
          shippedAt: null,
          deliveredAt: null,
          cancelledAt: null,
        },
      ],
      total: 6,
      page: 2,
      pageSize: 5,
    });
  });

  it('searches orders through the dedicated search endpoint', () => {
    let response: unknown;

    service.searchOrders({ query: 'metadata-needle', page: 1, pageSize: 5 }).subscribe((result) => {
      response = result;
    });

    const request = http.expectOne('/api/v1/orders/search?query=metadata-needle&page=1&pageSize=5');
    expect(request.request.method).toBe('GET');
    request.flush({ orders: [buildOrder()], total: 1, page: 1, pageSize: 5 });

    expect(response).toMatchObject({ total: 1, page: 1, pageSize: 5 });
  });

  it('creates, updates, cancels, loads timeline, generates proof, and verifies proof', () => {
    const created: Order[] = [];
    const proof = buildProof();
    const verifications: unknown[] = [];

    service
      .createOrder({
        customerId: 'customer-100',
        customerName: 'Northwind Receiving',
        customerEmail: 'receiving@example.com',
        currency: 'USD',
        items: [{ sku: 'SKU-100', name: 'Serialized sensor kit', quantity: 2, unitPrice: 49.5 }],
        shippingAddress: { line1: '100 Warehouse Way', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
      })
      .subscribe((order) => created.push(order));
    const createRequest = http.expectOne('/api/v1/orders');
    expect(createRequest.request.method).toBe('POST');
    createRequest.flush(buildOrder());

    service.updateOrderStatus(orderId, { status: 'confirmed', reason: 'ready' }).subscribe((order) => created.push(order));
    const statusRequest = http.expectOne(`/api/v1/orders/${orderId}/status`);
    expect(statusRequest.request.method).toBe('PATCH');
    expect(statusRequest.request.body).toEqual({ status: 'confirmed', reason: 'ready' });
    statusRequest.flush(buildOrder({ status: 'confirmed', confirmedAt: now }));

    service.cancelOrder(orderId, { reason: 'customer request' }).subscribe((order) => created.push(order));
    const cancelRequest = http.expectOne(`/api/v1/orders/${orderId}/cancel`);
    expect(cancelRequest.request.method).toBe('POST');
    cancelRequest.flush(buildOrder({ status: 'cancelled', cancelledAt: now }));

    service.getOrderTimeline(orderId).subscribe();
    http.expectOne(`/api/v1/orders/${orderId}/timeline`).flush([buildTimelineEvent()]);

    service.getOrderProof(orderId).subscribe((result) => {
      expect(result).toEqual(proof);
    });
    http.expectOne(`/api/v1/orders/${orderId}/proof`).flush(proof);

    service.verifyOrderProof(proof).subscribe((result) => verifications.push(result));
    const verifyRequest = http.expectOne('/api/v1/proofs/verify');
    expect(verifyRequest.request.method).toBe('POST');
    expect(verifyRequest.request.body).toEqual({ proof });
    verifyRequest.flush({ valid: true, proofHash: 'hash-123', verifiedAt: now });

    expect(created.map((order) => order.status)).toEqual(['pending', 'confirmed', 'cancelled']);
    expect(verifications).toEqual([{ valid: true, proofHash: 'hash-123', verifiedAt: now }]);
  });

  it('loads order detail and rejects invalid API response bodies', () => {
    let detail: OrderDetailResponse | undefined;
    let receivedError: unknown;

    service.getOrderById(orderId).subscribe((response) => {
      detail = response;
    });
    http.expectOne(`/api/v1/orders/${orderId}`).flush(buildOrderDetail());
    expect(detail?.timeline).toHaveLength(1);

    service.listOrders().subscribe({ error: (error) => {
      receivedError = error;
    } });
    http.expectOne('/api/v1/orders').flush({ invalid: true });

    expect(receivedError).toBeInstanceOf(Error);
  });

  it('maps API errors and exposes next status rules', () => {
    let message = '';

    service.createOrder({
      customerId: 'customer-100',
      customerName: 'Northwind Receiving',
      currency: 'USD',
      items: [{ sku: 'SKU-100', name: 'Serialized sensor kit', quantity: 1, unitPrice: 10 }],
      shippingAddress: { line1: '100 Warehouse Way', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
    }).subscribe({ error: (error: Error) => {
      message = error.message;
    } });

    http.expectOne('/api/v1/orders').flush({ message: 'Duplicate idempotency key' }, { status: 409, statusText: 'Conflict' });

    expect(message).toBe('Duplicate idempotency key');
    expect(service.nextStatus('pending')).toBe('confirmed');
    expect(service.nextStatus('delivered')).toBeNull();
  });
});
