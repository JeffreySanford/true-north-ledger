import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import type { CreateOrderRequest } from '@true-north-ledger/order-contracts';
import { OrdersService } from '../../orders.service';
import type { ProgressRailStep } from '../../shared/progress-rail/progress-rail.component';

type OrderItemForm = FormGroup<{
  sku: FormControl<string>;
  itemName: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
}>;

interface OrderCatalogItem {
  sku: string;
  name: string;
  unitPrice: number;
}

@Component({
  standalone: false,
  selector: 'tnl-order-create',
  templateUrl: './order-create.component.html',
  styleUrls: ['./orders.component.scss'],
})
export class OrderCreateComponent implements OnDestroy {
  public creating = false;
  public error: string | null = null;
  public success: string | null = null;
  public createStep = 0;
  public readonly createStepLabels = ['Customer', 'Items', 'Shipping', 'Review'];
  public readonly itemCatalog: OrderCatalogItem[] = [
    { sku: 'SKU-100', name: 'Serialized sensor kit', unitPrice: 49.5 },
    { sku: 'SKU-COLD', name: 'Cold-chain monitor', unitPrice: 72 },
    { sku: 'SKU-SEAL', name: 'Tamper-evident seal pack', unitPrice: 18.25 },
  ];

  private readonly ordersService = inject(OrdersService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  public readonly createForm = this.formBuilder.nonNullable.group({
    customerId: ['customer-100', [Validators.required]],
    customerName: ['Northwind Receiving', [Validators.required]],
    customerEmail: ['receiving@example.com', [Validators.email]],
    items: this.formBuilder.array([this.createItemGroup()]),
    line1: ['100 Warehouse Way', [Validators.required]],
    city: ['Austin', [Validators.required]],
    region: ['TX', [Validators.required]],
    postalCode: ['78701', [Validators.required]],
    country: ['US', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    metadata: ['{"source":"web"}'],
  });

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public submitCreate(): void {
    this.success = null;
    this.error = null;
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.createStep = this.firstInvalidCreateStep();
      this.error = 'Complete customer, item, and shipping fields before creating an order.';
      return;
    }

    const request = this.toCreateRequest();
    if (!request) {
      return;
    }

    this.creating = true;
    this.ordersService
      .createOrder(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (order) => {
          this.creating = false;
          this.success = `Order ${order.orderNumber} created`;
          void this.router.navigate(['/orders', order.id]);
        },
        error: (error) => {
          this.creating = false;
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public get createSteps(): ProgressRailStep[] {
    const form = this.createForm.getRawValue();
    return [
      { label: 'Customer', state: this.stepState(0, !!form.customerId && !!form.customerName) },
      { label: 'Items', state: this.stepState(1, this.items.valid && this.items.length > 0) },
      { label: 'Shipping', state: this.stepState(2, !!form.line1 && !!form.city && !!form.region && !!form.postalCode && !!form.country) },
      { label: 'Review', state: this.stepState(3, !!this.success) },
    ];
  }

  public get estimatedTotal(): string {
    const total = Math.round(
      this.items.getRawValue().reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      ) * 100,
    ) / 100;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number.isFinite(total) ? total : 0);
  }

  public get items(): FormArray<OrderItemForm> {
    return this.createForm.controls.items;
  }

  public nextCreateStep(): void {
    if (!this.isCreateStepValid(this.createStep)) {
      this.createForm.markAllAsTouched();
      this.error = `Complete the ${this.createStepLabels[this.createStep].toLowerCase()} step before continuing.`;
      return;
    }
    this.error = null;
    this.createStep = Math.min(this.createStep + 1, this.createStepLabels.length - 1);
  }

  public previousCreateStep(): void {
    this.error = null;
    this.createStep = Math.max(this.createStep - 1, 0);
  }

  public addItem(): void {
    this.items.push(this.createItemGroup({
      sku: '',
      itemName: '',
      quantity: 1,
      unitPrice: 0,
    }));
  }

  public removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  public applyCatalogItem(index: number): void {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    const item = this.items.at(index);
    const catalogItem = this.itemCatalog.find((candidate) => candidate.sku === item.controls.sku.value.trim());
    if (catalogItem) {
      item.patchValue({
        itemName: catalogItem.name,
        unitPrice: catalogItem.unitPrice,
      });
    }
  }

  private toCreateRequest(): CreateOrderRequest | null {
    const value = this.createForm.getRawValue();
    let metadata: Record<string, unknown> = {};
    try {
      metadata = value.metadata.trim() ? (JSON.parse(value.metadata) as Record<string, unknown>) : {};
    } catch {
      this.error = 'Metadata must be valid JSON.';
      return null;
    }

    return {
      customerId: value.customerId,
      customerName: value.customerName,
      customerEmail: value.customerEmail || undefined,
      currency: 'USD',
      items: value.items.map((item) => ({
        sku: item.sku,
        name: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      shippingAddress: {
        line1: value.line1,
        city: value.city,
        region: value.region,
        postalCode: value.postalCode,
        country: value.country,
      },
      metadata,
      idempotencyKey: `web-${value.customerId}-${value.items[0].sku}-${Date.now()}`,
    };
  }

  private createItemGroup(
    value = {
      sku: 'SKU-100',
      itemName: 'Serialized sensor kit',
      quantity: 2,
      unitPrice: 49.5,
    },
  ): OrderItemForm {
    const group = this.formBuilder.nonNullable.group({
      sku: [value.sku, [Validators.required]],
      itemName: [value.itemName, [Validators.required]],
      quantity: [value.quantity, [Validators.required, Validators.min(1)]],
      unitPrice: [value.unitPrice, [Validators.required, Validators.min(0)]],
    });

    group.controls.sku.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.applyCatalogItem(this.items.controls.indexOf(group)));

    return group;
  }

  private isCreateStepValid(step: number): boolean {
    if (step === 0) {
      return this.createForm.controls.customerId.valid &&
        this.createForm.controls.customerName.valid &&
        this.createForm.controls.customerEmail.valid;
    }
    if (step === 1) {
      return this.items.length > 0 && this.items.valid;
    }
    if (step === 2) {
      return [
        this.createForm.controls.line1,
        this.createForm.controls.city,
        this.createForm.controls.region,
        this.createForm.controls.postalCode,
        this.createForm.controls.country,
      ].every((control) => control.valid);
    }
    return this.createForm.valid;
  }

  private firstInvalidCreateStep(): number {
    return [0, 1, 2].find((step) => !this.isCreateStepValid(step)) ?? 3;
  }

  private stepState(index: number, complete: boolean): ProgressRailStep['state'] {
    if (complete || index < this.createStep) {
      return 'complete';
    }
    return index === this.createStep ? 'current' : 'pending';
  }
}
