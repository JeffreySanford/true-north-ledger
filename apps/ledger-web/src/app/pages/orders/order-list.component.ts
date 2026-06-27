import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import type { Order, OrderRealtimeEvent, OrderSearchRequest, OrderStatus, OrderSummary } from '@true-north-ledger/order-contracts';
import { OrdersService } from '../../orders.service';
import { OrderRealtimeService } from '../../order-realtime.service';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';

@Component({
  standalone: false,
  selector: 'tnl-order-list',
  templateUrl: './order-list.component.html',
  styleUrls: ['./orders.component.scss'],
})
export class OrderListComponent implements OnInit, OnDestroy {
  public readonly statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'];
  public orders: OrderSummary[] = [];
  public totalOrders = 0;
  public page = 1;
  public readonly pageSize = 5;
  public loading = false;
  public error: string | null = null;

  private readonly ordersService = inject(OrdersService);
  public readonly orderRealtime = inject(OrderRealtimeService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  public readonly filtersForm = this.formBuilder.nonNullable.group({
    status: ['' as OrderStatus | ''],
    query: [''],
    customerId: [''],
    createdFrom: [''],
    createdTo: [''],
    sortBy: ['createdAt' as OrderSearchRequest['sortBy']],
    sortDirection: ['desc' as OrderSearchRequest['sortDirection']],
  });

  ngOnInit(): void {
    this.orderRealtime.connect();
    this.orderRealtime.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => this.handleRealtimeEvent(event));
    this.loadOrders(1);
  }

  ngOnDestroy(): void {
    this.orderRealtime.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public applyFilters(): void {
    this.loadOrders(1);
  }

  public resetFilters(): void {
    this.filtersForm.reset({
      status: '',
      query: '',
      customerId: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    this.loadOrders(1);
  }

  public refresh(): void {
    this.loadOrders(this.page);
  }

  public previousPage(): void {
    if (this.page > 1) {
      this.loadOrders(this.page - 1);
    }
  }

  public nextPage(): void {
    if (this.page < this.totalPages) {
      this.loadOrders(this.page + 1);
    }
  }

  public get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalOrders / this.pageSize));
  }

  public get paginationSummary(): string {
    if (this.totalOrders === 0) {
      return 'Showing 0 orders';
    }
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.totalOrders);
    return `Showing ${start}-${end} of ${this.totalOrders} orders`;
  }

  public countByStatus(status: OrderStatus): number {
    return this.orders.filter((order) => order.status === status).length;
  }

  public statusTone(status: OrderStatus): StatusChipTone {
    if (status === 'delivered') {
      return 'success';
    }
    if (status === 'cancelled' || status === 'failed') {
      return 'error';
    }
    return status === 'pending' ? 'warning' : 'neutral';
  }

  public formatMoney(order: Pick<OrderSummary, 'currency' | 'totalAmount'>): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(order.totalAmount);
  }

  public exportCsv(): void {
    if (this.orders.length === 0) {
      return;
    }

    const rows = [
      ['Order Number', 'Customer', 'Status', 'Total', 'Currency', 'Created At'],
      ...this.orders.map((order) => [
        order.orderNumber,
        order.customerName,
        order.status,
        String(order.totalAmount),
        order.currency,
        order.createdAt,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');

    if (typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private loadOrders(page: number): void {
    this.loading = true;
    this.error = null;
    this.ordersService
      .listOrders({ ...this.activeFilters(), page, pageSize: this.pageSize })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.orders = response.orders;
          this.totalOrders = response.total;
          this.page = response.page ?? page;
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  private handleRealtimeEvent(event: OrderRealtimeEvent): void {
    if (event.type === 'status_changed' || event.type === 'cancelled') {
      this.applyRealtimeOrder(event.order);
      return;
    }

    this.loadOrders(this.page);
  }

  private applyRealtimeOrder(order: Order): void {
    const summary = this.toOrderSummary(order);
    const statusFilter = this.filtersForm.controls.status.value;
    const existingIndex = this.orders.findIndex((current) => current.id === summary.id);
    const matchesStatusFilter = !statusFilter || summary.status === statusFilter;

    if (existingIndex >= 0 && matchesStatusFilter) {
      this.orders = this.orders.map((current) => current.id === summary.id ? summary : current);
    } else if (existingIndex >= 0) {
      this.orders = this.orders.filter((current) => current.id !== summary.id);
      this.totalOrders = Math.max(0, this.totalOrders - 1);
    } else if (matchesStatusFilter) {
      this.orders = [summary, ...this.orders].slice(0, this.pageSize);
      this.totalOrders += 1;
    }

    this.changeDetectorRef.detectChanges();
  }

  private toOrderSummary(order: Order): OrderSummary {
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

  private activeFilters(): {
    status?: OrderStatus;
    query?: string;
    customerId?: string;
    createdFrom?: string;
    createdTo?: string;
    sortBy: OrderSearchRequest['sortBy'];
    sortDirection: OrderSearchRequest['sortDirection'];
  } {
    const value = this.filtersForm.getRawValue();
    return {
      ...(value.status ? { status: value.status } : {}),
      ...(value.query.trim() ? { query: value.query.trim() } : {}),
      ...(value.customerId.trim() ? { customerId: value.customerId.trim() } : {}),
      ...(value.createdFrom ? { createdFrom: new Date(`${value.createdFrom}T00:00:00.000`).toISOString() } : {}),
      ...(value.createdTo ? { createdTo: new Date(`${value.createdTo}T23:59:59.999`).toISOString() } : {}),
      sortBy: value.sortBy,
      sortDirection: value.sortDirection,
    };
  }

  private csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
