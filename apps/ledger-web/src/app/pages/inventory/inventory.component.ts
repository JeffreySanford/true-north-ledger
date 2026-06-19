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
  InventoryBatchScanResult,
  InventoryBulkMoveResult,
  InventoryImportResult,
  InventoryItem,
  InventoryListRequest,
  InventoryProvenanceEvent,
  InventoryProvenanceResponse,
  InventoryScanType,
  InventoryStatus,
} from '@true-north-ledger/inventory-contracts';
import { InventoryService } from '../../inventory.service';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';
import type { TimelineRailEntry } from '../../shared/timeline-rail/timeline-rail.component';

interface ProvenanceDiagramEntry {
  id: string;
  movement: string;
  actor: string;
  location: string;
  quantity: string;
  anomalyState: 'clear' | 'anomaly';
}

interface ProvenanceLocationEntry {
  id: string;
  step: number;
  location: string;
  movement: string;
  actor: string;
  anomalyState: 'clear' | 'anomaly';
}

type ScanFeedbackState = 'accepted' | 'rejected';

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
  provenance: InventoryProvenanceResponse | null = null;
  provenanceLoading = false;
  selectedItem: InventoryItem | null = null;
  detailLoading = false;
  anomalies: InventoryAnomaly[] = [];
  anomalyLoading = false;
  alerts: InventoryAlert[] = [];
  alertLoading = false;
  batchScanResults: InventoryBatchScanResult[] = [];
  bulkMoveResults: InventoryBulkMoveResult[] = [];
  importResults: InventoryImportResult[] = [];
  scanFeedbackState: ScanFeedbackState | null = null;
  toastMessage: string | null = null;
  toastTone: 'success' | 'error' = 'success';

  private readonly inventoryService = inject(InventoryService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private _error: string | null = null;
  private _success: string | null = null;

  get error(): string | null {
    return this._error;
  }

  set error(message: string | null) {
    this._error = message;
    if (message) this.openToast(message, 'error');
  }

  get success(): string | null {
    return this._success;
  }

  set success(message: string | null) {
    this._success = message;
    if (message) this.openToast(message, 'success');
  }

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

  readonly batchScanForm = this.formBuilder.nonNullable.group({
    values: ['', Validators.required],
    scanType: ['barcode' as InventoryScanType, Validators.required],
    locationId: [''],
  });

  readonly bulkMoveForm = this.formBuilder.nonNullable.group({
    itemIds: ['', Validators.required],
    locationId: ['', Validators.required],
    locationName: ['', Validators.required],
    reason: [''],
  });

  readonly importForm = this.formBuilder.nonNullable.group({
    payload: ['', Validators.required],
  });

  readonly anomalyFiltersForm = this.formBuilder.nonNullable.group({
    type: ['' as InventoryAnomalyType | ''],
    severity: ['' as InventoryAnomalySeverity | ''],
    detectedFrom: [''],
    detectedTo: [''],
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

  importInventoryBatch(): void {
    if (this.importForm.invalid) {
      this.importForm.markAllAsTouched();
      this.error = 'Paste a JSON array or CSV rows before importing inventory.';
      return;
    }

    let items: CreateInventoryItemRequest[];
    try {
      items = this.parseImportPayload(this.importForm.controls.payload.value);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Inventory import payload is invalid.';
      return;
    }

    if (items.length === 0 || items.length > 100) {
      this.error = 'Inventory import requires between 1 and 100 items.';
      return;
    }

    this.operatingItemId = 'import';
    this.error = null;
    this.success = null;
    this.importResults = [];
    this.inventoryService.importInventory({ items }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.importResults = response.results;
        const imported = response.results.filter((result) => result.success).length;
        this.success = `${imported} of ${response.results.length} inventory items imported.`;
        this.operatingItemId = null;
        this.load(1);
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.operatingItemId = null;
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

  refreshDashboard(): void {
    this.load(this.page);
  }

  previousPage(): void {
    if (this.page > 1) this.load(this.page - 1);
  }

  nextPage(): void {
    if (this.page < this.totalPages) this.load(this.page + 1);
  }

  reserve(item: InventoryItem, quantityValue: string, orderIdValue: string, timeoutMinutesValue = ''): void {
    const quantity = Number(quantityValue);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      this.error = `Reservation quantity must be between 1 and ${item.quantity}.`;
      return;
    }
    const orderId = orderIdValue.trim();
    const timeoutMinutes = timeoutMinutesValue.trim() ? Number(timeoutMinutesValue) : undefined;
    if (timeoutMinutes !== undefined && (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 10_080)) {
      this.error = 'Reservation timeout must be a whole number from 1 to 10080 minutes.';
      return;
    }
    this.runOperation(
      item.id,
      this.inventoryService.reserveInventory(item.id, {
        quantity,
        ...(orderId ? { orderId } : {}),
        ...(timeoutMinutes ? { timeoutMinutes } : {}),
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

  releaseExpiredReservations(): void {
    this.operatingItemId = 'release-expired-reservations';
    this.error = null;
    this.success = null;
    this.inventoryService.releaseExpiredReservations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.success = `${response.total} expired inventory reservations released.`;
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

  reservationExpiresAt(item: InventoryItem): string | null {
    const value = item.metadata['reservationExpiresAt'];
    return typeof value === 'string' && value.trim() ? value : null;
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

  moveInventoryBatch(): void {
    if (this.bulkMoveForm.invalid) {
      this.bulkMoveForm.markAllAsTouched();
      this.error = 'Enter at least one inventory item ID and a destination for bulk movement.';
      return;
    }
    const value = this.bulkMoveForm.getRawValue();
    const itemIds = value.itemIds.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    if (itemIds.length === 0 || itemIds.length > 100) {
      this.error = 'Bulk moves require between 1 and 100 inventory item IDs.';
      return;
    }
    this.operatingItemId = 'bulk-move';
    this.error = null;
    this.success = null;
    this.bulkMoveResults = [];
    this.inventoryService.moveInventoryBatch({
      itemIds,
      locationId: value.locationId.trim(),
      locationName: value.locationName.trim(),
      ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.bulkMoveResults = response.results;
        const moved = response.results.filter((result) => result.success).length;
        this.success = `${moved} of ${response.results.length} inventory items moved to ${value.locationName.trim()}.`;
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

  adjustQuantity(item: InventoryItem, quantityValue: string, reasonValue: string): void {
    const quantity = Number(quantityValue);
    const reason = reasonValue.trim();
    if (!Number.isInteger(quantity) || quantity < item.reservedQuantity) {
      this.error = `Quantity must be a whole number at least ${item.reservedQuantity}.`;
      return;
    }
    if (!reason) {
      this.error = 'A quantity adjustment reason is required.';
      return;
    }
    this.runOperation(
      item.id,
      this.inventoryService.adjustInventoryQuantity(item.id, { quantity, reason }),
      `${item.sku}: quantity adjusted to ${quantity} ${item.unitOfMeasure}.`,
    );
  }

  changeStatus(item: InventoryItem, statusValue: string, reasonValue: string): void {
    const status = statusValue as InventoryStatus;
    const reason = reasonValue.trim();
    if (!this.statuses.includes(status)) {
      this.error = 'Choose a valid inventory status.';
      return;
    }
    if (status === 'reserved' || status === 'removed') {
      this.error = 'Use reservation or removal controls for reserved and removed statuses.';
      return;
    }
    if (!reason) {
      this.error = 'A status change reason is required.';
      return;
    }
    this.runOperation(
      item.id,
      this.inventoryService.changeInventoryStatus(item.id, { status, reason }),
      `${item.sku}: status changed to ${status}.`,
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
    this.scanFeedbackState = null;
    this.inventoryService.scanInventory({
      value: value.value.trim(),
      scanType: value.scanType,
      ...(value.locationId.trim() ? { locationId: value.locationId.trim() } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (item) => {
        this.success = `${item.sku}: scan accepted at ${item.lastScannedAt}.`;
        this.scanFeedbackState = 'accepted';
        this.operatingItemId = null;
        this.scanForm.patchValue({ value: '' });
        this.load(this.page);
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.scanFeedbackState = 'rejected';
        this.operatingItemId = null;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  scanInventoryBatch(): void {
    if (this.batchScanForm.invalid) {
      this.batchScanForm.markAllAsTouched();
      this.error = 'Enter at least one SKU or serial number for bulk scanning.';
      return;
    }
    const value = this.batchScanForm.getRawValue();
    const scanValues = value.values.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    if (scanValues.length === 0 || scanValues.length > 100) {
      this.error = 'Bulk scans require between 1 and 100 SKU or serial number lines.';
      return;
    }
    this.operatingItemId = 'batch-scan';
    this.error = null;
    this.success = null;
    this.batchScanResults = [];
    const locationId = value.locationId.trim();
    this.inventoryService.scanInventoryBatch({
      scans: scanValues.map((scanValue) => ({
        value: scanValue,
        scanType: value.scanType,
        ...(locationId ? { locationId } : {}),
      })),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.batchScanResults = response.results;
        const accepted = response.results.filter((result) => result.success).length;
        this.success = `${accepted} of ${response.results.length} bulk inventory scans accepted.`;
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

  private parseImportPayload(payload: string): CreateInventoryItemRequest[] {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Inventory JSON import must be an array.');
      return parsed.map((item) => this.normalizeImportItem(item));
    }
    return this.parseCsvImport(trimmed);
  }

  private parseCsvImport(payload: string): CreateInventoryItemRequest[] {
    const rows = payload.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    if (rows.length < 2) throw new Error('Inventory CSV import requires a header row and at least one item row.');
    const headers = this.parseCsvRow(rows[0]).map((header) => header.trim());
    return rows.slice(1).map((row) => {
      const values = this.parseCsvRow(row);
      const record = headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = values[index]?.trim() ?? '';
        return acc;
      }, {});
      return this.normalizeImportItem(record);
    });
  }

  private parseCsvRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < row.length; index += 1) {
      const char = row[index];
      const next = row[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  private normalizeImportItem(raw: unknown): CreateInventoryItemRequest {
    if (!raw || typeof raw !== 'object') throw new Error('Each imported inventory row must be an object.');
    const record = raw as Record<string, unknown>;
    const quantity = Number(record['quantity']);
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Imported inventory quantity must be a non-negative integer.');
    return {
      sku: String(record['sku'] ?? '').trim().toUpperCase(),
      name: String(record['name'] ?? '').trim(),
      description: String(record['description'] ?? '').trim(),
      locationId: String(record['locationId'] ?? '').trim(),
      locationName: String(record['locationName'] ?? '').trim(),
      quantity,
      unitOfMeasure: String(record['unitOfMeasure'] ?? 'each').trim(),
      ...(String(record['batchNumber'] ?? '').trim() ? { batchNumber: String(record['batchNumber']).trim() } : {}),
      ...(String(record['serialNumber'] ?? '').trim() ? { serialNumber: String(record['serialNumber']).trim() } : {}),
      ...(String(record['expirationDate'] ?? '').trim() ? { expirationDate: String(record['expirationDate']).trim() } : {}),
      ...(record['metadata'] && typeof record['metadata'] === 'object' && !Array.isArray(record['metadata'])
        ? { metadata: record['metadata'] as Record<string, unknown> }
        : {}),
    };
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
    this.provenanceLoading = true;
    this.error = null;
    this.inventoryService.getInventoryItemWithProvenance(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.selectedItem = response.item;
        this.provenance = response;
        this.detailLoading = false;
        this.provenanceLoading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (error) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.detailLoading = false;
        this.provenanceLoading = false;
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

  get provenanceDiagramEntries(): ProvenanceDiagramEntry[] {
    const provenance = this.provenance;
    if (!provenance) return [];
    const eventIds = new Set(provenance.events.map((event) => event.eventId));
    const events = [...provenance.events, ...provenance.scanHistory.filter((event) => !eventIds.has(event.eventId))];
    return events.map((event) => {
      eventIds.add(event.eventId);
      return {
        id: event.eventId,
        movement: this.diagramMovement(event),
        actor: `${event.actorType} / ${event.actorId}`,
        location: event.locationName || event.locationId || 'Location not provided',
        quantity: `${event.quantity ?? provenance.item.quantity} ${provenance.item.unitOfMeasure}`,
        anomalyState: event.action === 'INVENTORY_ANOMALY_DETECTED' || event.details['accepted'] === false ? 'anomaly' : 'clear',
      };
    });
  }

  get provenanceLocationEntries(): ProvenanceLocationEntry[] {
    const entries: ProvenanceLocationEntry[] = [];
    this.provenanceDiagramEntries.forEach((entry) => {
      const previous = entries.at(-1);
      if (previous?.location === entry.location) return;
      entries.push({
        id: entry.id,
        step: entries.length + 1,
        location: entry.location,
        movement: entry.movement,
        actor: entry.actor,
        anomalyState: entry.anomalyState,
      });
    });
    return entries;
  }

  loadAnomalies(): void {
    this.anomalyLoading = true;
    const filters = this.anomalyFiltersForm.getRawValue();
    this.inventoryService.getAnomalies({
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.detectedFrom ? { detectedFrom: filters.detectedFrom } : {}),
      ...(filters.detectedTo ? { detectedTo: filters.detectedTo } : {}),
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

  resolveAnomaly(anomaly: InventoryAnomaly): void {
    if (anomaly.status === 'resolved') return;
    this.anomalies = this.anomalies.map((current) =>
      current.id === anomaly.id ? { ...current, status: 'resolved' } : current,
    );
    this.success = `${anomaly.sku}: anomaly marked resolved in the current view.`;
    this.changeDetectorRef.detectChanges();
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
      next: (updatedItem) => {
        this.success = message;
        this.items = this.items.map((item) => item.id === updatedItem.id ? updatedItem : item);
        if (this.selectedItem?.id === updatedItem.id) {
          this.selectedItem = updatedItem;
        }
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

  private diagramMovement(event: InventoryProvenanceEvent): string {
    if (event.action === 'INVENTORY_MOVED') return 'Moved';
    if (event.action === 'INVENTORY_SCANNED') return event.details['accepted'] === false ? 'Rejected scan' : 'Accepted scan';
    if (event.action === 'INVENTORY_RESERVED') return 'Reserved';
    if (event.action === 'INVENTORY_RESERVATION_RELEASED') return 'Released';
    if (event.action === 'INVENTORY_REMOVED') return 'Removed';
    if (event.action === 'INVENTORY_ANOMALY_DETECTED') return 'Anomaly detected';
    return 'Added';
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

  dismissToast(): void {
    this.toastMessage = null;
  }

  private openToast(message: string, tone: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastTone = tone;
  }
}
