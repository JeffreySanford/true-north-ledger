import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderStatus } from '@true-north-ledger/order-contracts';
import { OrderStatusIconComponent } from './order-status-icon.component';

describe('OrderStatusIconComponent', () => {
  let fixture: ComponentFixture<OrderStatusIconComponent>;
  let component: OrderStatusIconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [OrderStatusIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderStatusIconComponent);
    component = fixture.componentInstance;
  });

  it.each([
    ['pending', 'P'],
    ['confirmed', 'C'],
    ['processing', 'W'],
    ['shipped', 'S'],
    ['delivered', 'D'],
    ['cancelled', 'X'],
    ['failed', '!'],
  ] satisfies [OrderStatus, string][])('renders an accessible %s status icon', (status, symbol) => {
    component.status = status;
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('[data-testid="order-status-icon"]') as HTMLElement;
    expect(icon.textContent?.trim()).toBe(symbol);
    expect(icon.getAttribute('aria-label')).toBe(`Order status: ${status}`);
    expect(icon.dataset['status']).toBe(status);
  });
});
