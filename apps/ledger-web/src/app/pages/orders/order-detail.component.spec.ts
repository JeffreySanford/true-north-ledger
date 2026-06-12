import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import type { OrderDetailResponse, OrderProof } from '@true-north-ledger/order-contracts';
import { vi } from 'vitest';
import { OrdersService } from '../../orders.service';
import { OrderRealtimeService } from '../../order-realtime.service';
import { OrderDetailComponent } from './order-detail.component';
import { OrdersModule } from './orders.module';

const now = '2026-06-05T12:00:00.000Z';

function buildOrder(status: OrderDetailResponse['status'] = 'confirmed'): OrderDetailResponse {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerId: 'customer-100',
    customerName: 'Northwind Receiving',
    customerEmail: 'receiving@example.com',
    status,
    items: [{ sku: 'SKU-100', name: 'Serialized sensor kit', quantity: 2, unitPrice: 49.5 }],
    totalAmount: 99,
    currency: 'USD',
    shippingAddress: { line1: '100 Warehouse Way', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
    billingAddress: null,
    metadata: {},
    correlationId: '44444444-4444-4444-8444-444444444444',
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    timeline: [
      {
        eventId: '55555555-5555-4555-8555-555555555555',
        eventType: 'ORDER_CREATED',
        orderId: '33333333-3333-4333-8333-333333333333',
        orderNumber: 'ORD-20260605-0001',
        correlationId: '44444444-4444-4444-8444-444444444444',
        actorMetadata: { customerId: 'customer-100' },
        status: 'pending',
        actorType: 'user',
        actorId: 'admin',
        result: 'accepted',
        timestamp: now,
      },
    ],
  };
}

function buildProof(): OrderProof {
  return {
    orderId: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    correlationId: '44444444-4444-4444-8444-444444444444',
    generatedAt: now,
    generator: 'ledger-api',
    events: buildOrder().timeline,
    proofHash: 'hash-123',
  };
}

describe('OrderDetailComponent', () => {
  let fixture: ComponentFixture<OrderDetailComponent>;
  let component: OrderDetailComponent;
  let ordersService: Partial<Record<keyof OrdersService, ReturnType<typeof vi.fn>>>;
  let realtimeEvents: Subject<{ order: OrderDetailResponse }>;
  let realtimeDisconnectMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ordersService = {
      getOrderById: vi.fn(() => of(buildOrder())),
      nextStatus: vi.fn(() => 'processing'),
      updateOrderStatus: vi.fn(() => of({ ...buildOrder('processing'), timeline: undefined })),
      cancelOrder: vi.fn(() => of({ ...buildOrder('cancelled'), timeline: undefined })),
      getOrderProof: vi.fn(),
      verifyOrderProof: vi.fn(),
    };
    realtimeEvents = new Subject();
    realtimeDisconnectMock = vi.fn();

    await TestBed.configureTestingModule({
      imports: [OrdersModule],
      providers: [
        provideNoopAnimations(),
        { provide: OrdersService, useValue: ordersService },
        {
          provide: OrderRealtimeService,
          useValue: {
            connect: vi.fn(),
            disconnect: realtimeDisconnectMock,
            connected$: new BehaviorSubject(true),
            events$: realtimeEvents,
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '33333333-3333-4333-8333-333333333333' } } } },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders lifecycle state and current timeline from server detail', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.order?.orderNumber).toBe('ORD-20260605-0001');
    expect(component.lifecycleSteps(buildOrder()).map((step) => step.state)).toEqual(['complete', 'current', 'pending', 'pending', 'pending']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="order-detail"] [data-testid="order-status-icon"]')?.getAttribute('aria-label')).toBe('Order status: confirmed');
    expect(fixture.nativeElement.textContent).toContain('ORD-20260605-0001');
    expect(fixture.nativeElement.textContent).toContain('ORDER_CREATED');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="order-realtime-state"]')?.textContent).toContain('connected');
  });

  it('reloads detail only when the matching order receives a real-time update', () => {
    realtimeEvents.next({ order: buildOrder() });
    realtimeEvents.next({ order: { ...buildOrder(), id: '99999999-9999-4999-8999-999999999999' } });

    expect(ordersService.getOrderById).toHaveBeenCalledTimes(2);
  });

  it('disconnects real-time updates when destroyed', () => {
    fixture.destroy();

    expect(realtimeDisconnectMock).toHaveBeenCalledOnce();
  });

  it('generates and verifies a proof', async () => {
    const proof = buildProof();
    ordersService.getOrderProof?.mockReturnValue(of(proof));
    ordersService.verifyOrderProof?.mockReturnValue(of({ valid: true, proofHash: 'hash-123', verifiedAt: now }));

    component.generateProof();
    component.verifyProof();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.verification?.valid).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Proof verified');
  });

  it('prints the loaded order detail', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    try {
      component.printOrder();

      expect(printSpy).toHaveBeenCalled();
      expect(component.printActionMessage).toBe('Print dialog opened');
    } finally {
      printSpy.mockRestore();
    }
  });
});
