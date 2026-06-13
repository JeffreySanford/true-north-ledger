import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import type {
  CreateInventoryItemRequest,
  InventoryAlert,
  InventoryAlertSeverity,
  InventoryAlertType,
  InventoryAnomaly,
  InventoryAnomalySeverity,
  InventoryAnomalyType,
  InventoryItem,
  InventoryListRequest,
  InventoryProvenanceResponse,
  InventoryScanType,
  InventoryStatus,
} from '@true-north-ledger/inventory-contracts';
import { InventoryService } from '../../inventory.service';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';
import type { TimelineRailEntry } from '../../shared/timeline-rail/timeline-rail.component';

@Component({
  standalone: false,
  selector: 'tnl-inventory',
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit, OnDestroy {
  readonly statuses: InventoryStatus[] = ['available', 'reserved', 'in_transit', 'damaged', 'expired', 'removed'];
  readonly scanTypes: InventoryScanType[] = ['manual', 'barcode', 'qr', 'rfid'];
  items: InventoryItem[] = [];
  total = 0;
  page = 1;
  readonly pageSize = 10;
  loading = false;
  submitting = false;
  operatingItemId: string | null = null;
  error: string | null = null;
  success: string | null = null;
  provenance: InventoryProvenanceResponse | null = null;
  provenanceLoading = false;
  selectedItem: InventoryItem | null = null;
  detailLoading = false;
  anomalies: InventoryAnomaly[] = [];
  anomalyLoading = false;
  alerts: InventoryAlert[] = [];
  alertLoading = false;

  private readonly inventoryService = inject(InventoryService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  readonly addForm = this.formBuilder.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(80)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    locationId: ['', Validators.required],
    locationName: ['', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0)]],
    unitOfMeasure: ['each', Validators.required],
  });

  readonly filtersForm = this.formBuilder.nonNullable.group({
    query: [''],
    locationId: [''],
    status: ['' as InventoryStatus | ''],
    sortBy: ['createdAt' as InventoryListRequest['sortBy']],
    sortDirection: ['desc' as InventoryListRequest['sortDirection']],
  });

  readonly scanForm = this.formBuilder.nonNullable.group({
    value: ['', Validators.required],
    scanType: ['manual' as InventoryScanType, Validators.required],
    locationId: [''],
  });

  readonly anomalyFiltersForm = this.formBuilder.nonNullable.group({
    type: ['' as InventoryAnomalyType | ''],
    severity: ['' as InventoryAnomalySeverity | ''],
  });

  readonly alertFiltersForm = this.formBuilder.nonNullable.group({
    type: ['' as InventoryAlertType | ''],
    severity: ['' as InventoryAlertSeverity | ''],
  });

  ngOnInit(): void {
    this.load(1);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addInventory(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      this.error = 'Complete all required inventory fields with a non-negative quantity.';
      return;
    }
    this.submitting = true;
    this.error = null;
    this.success = null;
    const value = this.addForm.getRawValue();
    const request: CreateInventoryItemRequest = { ...value, sku: value.sku.trim().toUpperCase() };
    this.inventoryService
      .addInventory(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (item) => {
          this.success = `${item.sku} added to ${item.locationName}.`;
          this.submitting = false;
          this.addForm.reset({ sku: '', name: '', locationId: '', locationName: '', quantity: 0, unitOfMeasure: 'each' });
          this.load(1);
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.submitting = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  applyFilters(): void {
    this.load(1);
  }

  resetFilters(): void {
    this.filtersForm.reset({ query: '', locationId: '', status: '', sortBy: 'createdAt', sortDirection: 'desc' });
    this.load(1);
  }

  previousPage(): void {
    if (this.page > 1) this.load(this.page - 1);
  }

  nextPage(): void {
    if (this.page < this.totalPages) this.load(this.page + 1);
  }

  reserve(item: InventoryItem, quantityValue: string, orderIdValue: string): void {
    const quantity = Number(quantityValue);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      this.error = `Reservation quantity must be between 1 and ${item.quantity}.`;
      return;
    }
    const orderId = orderIdValue.trim();
    this.runOperation(
      item.id,
      this.inventoryService.reserveInventory(item.id, {
        quantity,
        ...(orderId ? { orderId } : {}),
      }),
      `${item.sku}: ${quantity} ${item.unitOfMeasure} reserved.`,
    );
  }

  release(item: InventoryItem): void {
    this.runOperation(
      item.id,
      this.inventoryService.releaseInventory(item.id),
      `${item.sku}: reservation released.`,
    );
  }

  move(item: InventoryItem, locationIdValue: string, locationNameValue: string): void {
    const locationId = locationIdValue.trim();
    const locationName = locationNameValue.trim();
    if (!locationId || !locationName) {
      this.error = 'Provide both a destination location ID and name.';
      return;
    }
    this.runOperation(
      item.id,
      this.inventoryService.moveInventory(item.id, { locationId, locationName }),
      `${item.sku}: moved to ${locationName}.`,
    );
  }

  remove(item: InventoryItem, reasonValue: string): void {
    const reason = reasonValue.trim();
    if (!reason) {
      this.error = 'A removal reason is required.';
      return;
    }
    this.runOperation(
      item.id,
      this.inventoryService.removeInventory(item.id, { reason }),
      `${item.sku}: removed from active inventory.`,
    );
  }

  scanInventory(): void {
    if (this.scanForm.invalid) {
      this.scanForm.markAllAsTouched();
      this.error = 'Enter a SKU or serial number to scan.';
      return;
    }
    const value = this.scanForm.getRawValue();
    this.operatingItemId = 'scan';
    this.error = null;
    this.success = null;
    this.inventoryService.scanInventory({
      value: value.value.trim(),
      scanType: value.scanType,
      ...(value.locationId.trim() ? { locationId: value.locationId.trim() } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (item) => {
        this.success = `${item.sku}: scan accepted at ${item.lastScannedAt}.`;
        this.operatingItemId = null;
        this.scanForm.patchValue({ value: '' });
        this.load(this.page);
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.operatingItemId = null;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  loadProvenance(item: InventoryItem): void {
    this.provenanceLoading = true;
    this.error = null;
    this.inventoryService.getProvenance(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.provenance = response;
        this.provenanceLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.provenanceLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  loadDetail(item: InventoryItem): void {
    this.detailLoading = true;
    this.error = null;
    this.inventoryService.getInventoryItem(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.selectedItem = response;
        this.detailLoading = false;
        this.loadProvenance(response);
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.detailLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  closeDetail(): void {
    this.selectedItem = null;
    this.provenance = null;
  }

  get provenanceEntries(): TimelineRailEntry[] {
    return this.provenance?.events.map((event) => ({
      title: event.action,
      timestamp: event.timestamp,
      state: 'done',
    })) ?? [];
  }

  loadAnomalies(): void {
    this.anomalyLoading = true;
    const filters = this.anomalyFiltersForm.getRawValue();
    this.inventoryService.getAnomalies({
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.anomalies = response.anomalies;
        this.anomalyLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.anomalyLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  detectAnomalies(): void {
    this.anomalyLoading = true;
    this.inventoryService.detectAnomalies().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.anomalies = response.anomalies;
        this.success = `${response.total} inventory anomalies detected and recorded.`;
        this.anomalyLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.anomalyLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  loadAlerts(): void {
    this.alertLoading = true;
    const filters = this.alertFiltersForm.getRawValue();
    this.inventoryService.getAlerts({
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.alerts = response.alerts;
        this.alertLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.alertLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  generateAlerts(): void {
    this.alertLoading = true;
    this.inventoryService.generateAlerts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.alerts = response.alerts;
        this.success = `${response.total} inventory alerts generated and recorded.`;
        this.alertLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.alertLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  countByStatus(status: InventoryStatus): number {
    return this.items.filter((item) => item.status === status).length;
  }

  isLowStock(item: InventoryItem): boolean {
    return item.status !== 'removed' && item.quantity <= 5;
  }

  statusTone(status: InventoryStatus): StatusChipTone {
    if (status === 'available') return 'success';
    if (status === 'damaged' || status === 'expired' || status === 'removed') return 'error';
    if (status === 'reserved' || status === 'in_transit') return 'warning';
    return 'neutral';
  }

  private runOperation(itemId: string, operation: ReturnType<InventoryService['reserveInventory']>, message: string): void {
    this.operatingItemId = itemId;
    this.error = null;
    this.success = null;
    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = message;
        this.operatingItemId = null;
        this.load(this.page);
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.operatingItemId = null;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  private load(page: number): void {
    this.loading = true;
    this.error = null;
    const filters = this.filtersForm.getRawValue();
    this.inventoryService
      .listInventory({
        ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
        ...(filters.locationId.trim() ? { locationId: filters.locationId.trim() } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        sortBy: filters.sortBy,
        sortDirection: filters.sortDirection,
        page,
        pageSize: this.pageSize,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.total = response.total;
          this.page = response.page;
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
}
