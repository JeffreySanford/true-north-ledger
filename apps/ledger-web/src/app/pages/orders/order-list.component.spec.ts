import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { vi } from 'vitest';
import type { Order, OrderRealtimeEvent, OrderSummary } from '@true-north-ledger/order-contracts';
import { OrdersService } from '../../orders.service';
import { OrderRealtimeService } from '../../order-realtime.service';
import { OrderListComponent } from './order-list.component';
import { OrdersModule } from './orders.module';

const now = '2026-06-05T12:00:00.000Z';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerId: 'customer-100',
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    status: 'pending',
    items: [{ sku: 'SKU-100', name: 'Serialized sensor kit', quantity: 2, unitPrice: 49.5 }],
    totalAmount: 99,
    currency: 'USD',
    shippingAddress: { line1: '100 Warehouse Way', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
    billingAddress: null,
    metadata: {},
    correlationId: '44444444-4444-4444-8444-444444444444',
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function buildSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  const order = buildOrder();
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
    ...overrides,
  };
}

describe('OrderListComponent', () => {
  let fixture: ComponentFixture<OrderListComponent>;
  let component: OrderListComponent;
  let listOrdersMock: ReturnType<typeof vi.fn>;
  let realtimeEvents: Subject<unknown>;
  let realtimeDisconnectMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listOrdersMock = vi.fn(() => of({ orders: [buildSummary()], total: 1, page: 1, pageSize: 5 }));
    realtimeEvents = new Subject();
    realtimeDisconnectMock = vi.fn();
    await TestBed.configureTestingModule({
      imports: [OrdersModule],
      providers: [
        provideRouter([]),
        {
          provide: OrdersService,
          useValue: {
            listOrders: listOrdersMock,
          },
        },
        {
          provide: OrderRealtimeService,
          useValue: {
            connect: vi.fn(),
            disconnect: realtimeDisconnectMock,
            connected$: new BehaviorSubject(true),
            events$: realtimeEvents,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders order list rows and status summaries from the API', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="order-card"]')).toHaveLength(1);
    expect(root.querySelector('[data-testid="order-card"] [data-testid="order-status-icon"]')?.getAttribute('aria-label')).toBe('Order status: pending');
    expect(root.textContent).toContain('ORD-20260605-0001');
    expect(root.textContent).toContain('Northwind Receiving');
    expect(root.textContent).toContain('Showing 1-1 of 1 orders');
    expect(root.querySelector('[data-testid="order-realtime-state"]')?.textContent).toContain('connected');
  });

  it('refreshes the active page when a real-time order creation event arrives', () => {
    realtimeEvents.next({
      type: 'created',
      order: buildOrder(),
      occurredAt: now,
    } satisfies OrderRealtimeEvent);

    expect(listOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 5 }));
    expect(listOrdersMock).toHaveBeenCalledTimes(2);
  });

  it('updates the visible order status when a real-time status change arrives', async () => {
    await fixture.whenStable();
    const updatedAt = '2026-06-05T12:01:00.000Z';

    realtimeEvents.next({
      type: 'status_changed',
      order: buildOrder({
        status: 'confirmed',
        confirmedAt: updatedAt,
        updatedAt,
      }),
      occurredAt: updatedAt,
    } satisfies OrderRealtimeEvent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(listOrdersMock).toHaveBeenCalledTimes(1);
    expect(component.orders[0]?.status).toBe('confirmed');
    expect(root.querySelector('[data-testid="order-card"] [data-testid="order-status-icon"]')?.getAttribute('aria-label')).toBe('Order status: confirmed');
    expect(root.querySelector('.summary-tile__label')?.textContent).toContain('pending');
    expect(component.countByStatus('pending')).toBe(0);
    expect(component.countByStatus('confirmed')).toBe(1);
  });

  it('disconnects real-time updates when destroyed', () => {
    fixture.destroy();

    expect(realtimeDisconnectMock).toHaveBeenCalledOnce();
  });

  it('applies status, date range, and sorting filters', () => {
    component.filtersForm.setValue({
      status: 'pending',
      query: 'north',
      customerId: 'customer-100',
      createdFrom: '2026-06-01',
      createdTo: '2026-06-05',
      sortBy: 'totalAmount',
      sortDirection: 'asc',
    });

    component.applyFilters();

    expect(listOrdersMock).toHaveBeenLastCalledWith({
      status: 'pending',
      query: 'north',
      customerId: 'customer-100',
      createdFrom: '2026-06-01T05:00:00.000Z',
      createdTo: '2026-06-06T04:59:59.999Z',
      sortBy: 'totalAmount',
      sortDirection: 'asc',
      page: 1,
      pageSize: 5,
    });
  });

  it('resets filters, sorting, and pagination before reloading all orders', () => {
    component.filtersForm.setValue({
      status: 'delivered',
      query: 'south',
      customerId: 'customer-200',
      createdFrom: '2026-06-01',
      createdTo: '2026-06-05',
      sortBy: 'totalAmount',
      sortDirection: 'asc',
    });

    component.resetFilters();

    expect(component.filtersForm.getRawValue()).toEqual({
      status: '',
      query: '',
      customerId: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    expect(listOrdersMock).toHaveBeenLastCalledWith({
      sortBy: 'createdAt',
      sortDirection: 'desc',
      page: 1,
      pageSize: 5,
    });
  });

  it('exports visible orders as CSV', () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:orders');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    });

    try {
      component.exportCsv();

      expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:orders');
    } finally {
      createElementSpy.mockRestore();
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
    }
  });
});
