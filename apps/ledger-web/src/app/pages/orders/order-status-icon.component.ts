import { Component, Input } from '@angular/core';
import type { OrderStatus } from '@true-north-ledger/order-contracts';

const orderStatusSymbols: Record<OrderStatus, string> = {
  pending: 'P',
  confirmed: 'C',
  processing: 'W',
  shipped: 'S',
  delivered: 'D',
  cancelled: 'X',
  failed: '!',
};

@Component({
  selector: 'tnl-order-status-icon',
  standalone: false,
  template: `
    <span
      class="order-status-icon"
      data-testid="order-status-icon"
      [attr.aria-label]="'Order status: ' + status"
      [attr.data-status]="status"
    >
      {{ symbol }}
    </span>
  `,
  styles: `
    .order-status-icon {
      display: inline-grid;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border: 1px solid var(--tnl-border, #c4cad5);
      border-radius: 999px;
      background: #e7eefb;
      color: #1e3f7a;
      font-weight: 800;
    }
  `,
})
export class OrderStatusIconComponent {
  @Input({ required: true }) status: OrderStatus = 'pending';

  get symbol(): string {
    return orderStatusSymbols[this.status];
  }
}
