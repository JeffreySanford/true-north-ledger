import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import type { Order, OrderDetailResponse, OrderProof, OrderProofVerificationResponse, OrderStatus } from '@true-north-ledger/order-contracts';
import { OrdersService } from '../../orders.service';
import { OrderRealtimeService } from '../../order-realtime.service';
import type { ProgressRailStep } from '../../shared/progress-rail/progress-rail.component';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';

@Component({
  standalone: false,
  selector: 'tnl-order-detail',
  templateUrl: './order-detail.component.html',
  styleUrls: ['./orders.component.scss'],
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  public order: OrderDetailResponse | null = null;
  public proof: OrderProof | null = null;
  public verification: OrderProofVerificationResponse | null = null;
  public loading = false;
  public proofLoading = false;
  public error: string | null = null;
  public printActionMessage: string | null = null;
  public statusReason = 'Lifecycle update from order detail';
  public cancellationReason = 'Cancelled from order detail';

  private readonly ordersService = inject(OrdersService);
  public readonly orderRealtime = inject(OrderRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.orderRealtime.connect();
    this.orderRealtime.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.order.id === this.order?.id) {
          this.load();
        }
      });
    this.load();
  }

  ngOnDestroy(): void {
    this.orderRealtime.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = 'Order id is required';
      return;
    }

    this.loading = true;
    this.error = null;
    this.ordersService
      .getOrderById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (order) => {
          this.order = order;
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

  public backToOrders(): void {
    void this.router.navigate(['/orders']);
  }

  public advanceStatus(): void {
    if (!this.order || !this.nextStatus) {
      return;
    }

    this.ordersService
      .updateOrderStatus(this.order.id, { status: this.nextStatus, reason: this.statusReason })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => this.applyOrderUpdate(updated),
        error: (error) => this.setError(error),
      });
  }

  public cancelOrder(): void {
    if (!this.order || !this.canCancel) {
      return;
    }

    this.ordersService
      .cancelOrder(this.order.id, { reason: this.cancellationReason })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => this.applyOrderUpdate(updated),
        error: (error) => this.setError(error),
      });
  }

  public generateProof(): void {
    if (!this.order) {
      return;
    }

    this.proofLoading = true;
    this.verification = null;
    this.ordersService
      .getOrderProof(this.order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (proof) => {
          this.proof = proof;
          this.proofLoading = false;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.proofLoading = false;
          this.setError(error);
        },
      });
  }

  public verifyProof(): void {
    if (!this.proof) {
      return;
    }

    this.ordersService
      .verifyOrderProof(this.proof)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (verification) => {
          this.verification = verification;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => this.setError(error),
      });
  }

  public printOrder(): void {
    if (!this.order || typeof window === 'undefined') {
      return;
    }

    window.print();
    this.printActionMessage = 'Print dialog opened';
  }

  public get nextStatus(): OrderStatus | null {
    return this.order ? this.ordersService.nextStatus(this.order.status) : null;
  }

  public get canCancel(): boolean {
    return !!this.order && ['pending', 'confirmed', 'processing'].includes(this.order.status);
  }

  public lifecycleSteps(order: OrderDetailResponse): ProgressRailStep[] {
    const flow: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const currentIndex = flow.indexOf(order.status);
    return flow.map((status, index) => ({
      label: status,
      state: index < currentIndex || order.status === 'delivered' ? 'complete' : index === currentIndex ? 'current' : 'pending',
    }));
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

  public formatMoney(order: Pick<OrderDetailResponse, 'currency' | 'totalAmount'>): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(order.totalAmount);
  }

  private applyOrderUpdate(updated: Order): void {
    if (!this.order) {
      return;
    }
    this.order = {
      ...this.order,
      ...updated,
    };
    this.proof = null;
    this.verification = null;
    this.load();
  }

  private setError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.changeDetectorRef.detectChanges();
  }
}
