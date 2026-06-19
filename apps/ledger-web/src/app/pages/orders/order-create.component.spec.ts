import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { Order } from '@true-north-ledger/order-contracts';
import { OrdersService } from '../../orders.service';
import { OrderCreateComponent } from './order-create.component';
import { OrdersModule } from './orders.module';

const now = '2026-06-05T12:00:00.000Z';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    orderNumber: 'ORD-20260605-0002',
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

describe('OrderCreateComponent', () => {
  let fixture: ComponentFixture<OrderCreateComponent>;
  let component: OrderCreateComponent;
  let createOrderMock: ReturnType<typeof vi.fn>;
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createOrderMock = vi.fn(() => of(buildOrder()));

    await TestBed.configureTestingModule({
      imports: [OrdersModule],
      providers: [
        provideRouter([]),
        { provide: OrdersService, useValue: { createOrder: createOrderMock } },
      ],
    }).compileComponents();

    navigateMock = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(OrderCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders as the dedicated order creation component', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="order-create"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Step 1 of 4: Customer');
  });

  it('calculates the review total and submits valid orders', async () => {
    component.createForm.patchValue({ customerName: 'Created Customer' });
    component.items.at(0).patchValue({ quantity: 3, unitPrice: 12.5 });

    expect(component.estimatedTotal).toContain('37.50');

    component.submitCreate();
    await fixture.whenStable();

    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Created Customer',
      items: [expect.objectContaining({ quantity: 3, unitPrice: 12.5 })],
    }));
    expect(navigateMock).toHaveBeenCalledWith(['/orders', buildOrder().id]);
  });

  it('navigates creation steps forward and backward and blocks invalid steps', () => {
    component.nextCreateStep();
    expect(component.createStep).toBe(1);

    component.items.at(0).patchValue({ sku: '' });
    component.nextCreateStep();
    expect(component.createStep).toBe(1);
    expect(component.error).toContain('items step');

    component.items.at(0).patchValue({ sku: 'SKU-100' });
    component.nextCreateStep();
    component.nextCreateStep();
    expect(component.createStep).toBe(3);

    component.previousCreateStep();
    expect(component.createStep).toBe(2);
  });

  it('adds and removes order items and includes all items in the total and request', async () => {
    component.addItem();
    component.items.at(1).patchValue({
      sku: 'SKU-200',
      itemName: 'Backup sensor',
      quantity: 3,
      unitPrice: 10,
    });

    expect(component.items).toHaveLength(2);
    expect(component.estimatedTotal).toContain('129.00');
    fixture.detectChanges();

    component.submitCreate();
    await fixture.whenStable();

    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ sku: 'SKU-100', quantity: 2, unitPrice: 49.5 }),
        expect.objectContaining({ sku: 'SKU-200', quantity: 3, unitPrice: 10 }),
      ],
    }));

    component.removeItem(1);
    component.removeItem(0);
    expect(component.items).toHaveLength(1);
  });

  it('autocompletes known catalog SKUs and preserves custom item values', () => {
    component.items.at(0).patchValue({ sku: 'SKU-COLD', itemName: 'Temporary name', unitPrice: 1 });
    component.applyCatalogItem(0);
    expect(component.items.at(0).getRawValue()).toMatchObject({
      sku: 'SKU-COLD',
      itemName: 'Cold-chain monitor',
      unitPrice: 72,
    });

    component.items.at(0).patchValue({ sku: 'CUSTOM-SKU', itemName: 'Custom item', unitPrice: 15 });
    component.applyCatalogItem(0);
    expect(component.items.at(0).getRawValue()).toMatchObject({
      sku: 'CUSTOM-SKU',
      itemName: 'Custom item',
      unitPrice: 15,
    });
  });

  it('autocompletes catalog values when SKU form control changes', () => {
    component.addItem();
    const addedItem = component.items.at(1);

    addedItem.controls.sku.setValue('SKU-COLD');

    expect(addedItem.getRawValue()).toMatchObject({
      sku: 'SKU-COLD',
      itemName: 'Cold-chain monitor',
      unitPrice: 72,
    });
  });

  it('rejects invalid metadata before calling the API', () => {
    component.createForm.controls.metadata.setValue('{invalid');
    component.submitCreate();

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(component.error).toBe('Metadata must be valid JSON.');
  });
});
