import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import type { InventoryItem } from '@true-north-ledger/inventory-contracts';
import { InventoryService } from '../../inventory.service';
import { InventoryComponent } from './inventory.component';
import { InventoryModule } from './inventory.module';

const item: InventoryItem = {
  id: '55555555-5555-4555-8555-555555555555',
  tenantId: '11111111-1111-4111-8111-111111111111',
  sku: 'SKU-LOW',
  name: 'Low stock sensor',
  description: '',
  locationId: 'AUSTIN-A1',
  locationName: 'Austin Warehouse - Aisle A1',
  quantity: 4,
  reservedQuantity: 0,
  reservationOrderId: null,
  unitOfMeasure: 'each',
  status: 'available',
  batchNumber: null,
  serialNumber: null,
  expirationDate: null,
  metadata: {},
  createdAt: '2026-06-11T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  lastScannedAt: null,
  removalReason: null,
  removedAt: null,
};

describe('InventoryComponent', () => {
  let fixture: ComponentFixture<InventoryComponent>;
  let component: InventoryComponent;
  let listMock: ReturnType<typeof vi.fn>;
  let addMock: ReturnType<typeof vi.fn>;
  let importMock: ReturnType<typeof vi.fn>;
  let reserveMock: ReturnType<typeof vi.fn>;
  let releaseMock: ReturnType<typeof vi.fn>;
  let releaseExpiredMock: ReturnType<typeof vi.fn>;
  let moveMock: ReturnType<typeof vi.fn>;
  let bulkMoveMock: ReturnType<typeof vi.fn>;
  let adjustQuantityMock: ReturnType<typeof vi.fn>;
  let changeStatusMock: ReturnType<typeof vi.fn>;
  let removeMock: ReturnType<typeof vi.fn>;
  let scanMock: ReturnType<typeof vi.fn>;
  let batchScanMock: ReturnType<typeof vi.fn>;
  let detailMock: ReturnType<typeof vi.fn>;
  let provenanceMock: ReturnType<typeof vi.fn>;
  let anomaliesMock: ReturnType<typeof vi.fn>;
  let detectAnomaliesMock: ReturnType<typeof vi.fn>;
  let alertsMock: ReturnType<typeof vi.fn>;
  let generateAlertsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listMock = vi.fn(() => of({ items: [item], total: 1, page: 1, pageSize: 10 }));
    addMock = vi.fn(() => of(item));
    importMock = vi.fn(() => of({
      results: [
        { index: 0, sku: 'SKU-IMPORT-1', success: true, item: { ...item, sku: 'SKU-IMPORT-1', name: 'Imported sensor one', quantity: 6 } },
        { index: 1, sku: 'SKU-100', success: false, error: 'Inventory SKU SKU-100 already exists for tenant' },
      ],
    }));
    reserveMock = vi.fn(() => of({ ...item, quantity: 2, reservedQuantity: 2, status: 'reserved' as const }));
    releaseMock = vi.fn(() => of(item));
    releaseExpiredMock = vi.fn(() => of({ released: [{ ...item, quantity: 4, reservedQuantity: 0 }], total: 1 }));
    moveMock = vi.fn(() => of({ ...item, locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' }));
    bulkMoveMock = vi.fn(() => of({
      results: [
        { index: 0, itemId: item.id, success: true, item: { ...item, locationId: 'AUSTIN-C3', locationName: 'Austin Warehouse - Aisle C3' } },
        { index: 1, itemId: '66666666-6666-4666-8666-666666666666', success: false, error: 'Inventory item not found' },
      ],
    }));
    adjustQuantityMock = vi.fn(() => of({ ...item, quantity: 8 }));
    changeStatusMock = vi.fn(() => of({ ...item, status: 'damaged' as const }));
    removeMock = vi.fn(() => of({
      ...item,
      quantity: 0,
      status: 'removed' as const,
      removalReason: 'Damaged beyond repair',
      removedAt: '2026-06-12T04:10:00.000Z',
    }));
    scanMock = vi.fn(() => of({ ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' }));
    batchScanMock = vi.fn(() => of({
      results: [
        { index: 0, value: 'SKU-LOW', success: true, item: { ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' } },
        { index: 1, value: 'UNKNOWN', success: false, error: 'Inventory item UNKNOWN not found' },
      ],
    }));
    detailMock = vi.fn(() => of({
      ...item,
      description: 'Serialized warehouse sensor',
      batchNumber: 'LOT-42',
      serialNumber: 'SERIAL-001',
    }));
    provenanceMock = vi.fn(() => of({
      item: {
        ...item,
        description: 'Serialized warehouse sensor',
        batchNumber: 'LOT-42',
        serialNumber: 'SERIAL-001',
      },
      events: [{
        eventId: '66666666-6666-4666-8666-666666666666',
        action: 'INVENTORY_ADDED' as const,
        actorType: 'user',
        actorId: 'inventory-admin',
        deviceId: null,
        deviceType: null,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 4,
        reservedQuantity: 0,
        details: { action: 'INVENTORY_ADDED' },
        timestamp: '2026-06-11T12:00:00.000Z',
        chainSequence: 1,
        eventHash: 'hash-1',
      }],
      reservationHistory: [{
        eventId: '77777777-7777-4777-8777-777777777777',
        action: 'INVENTORY_RESERVED' as const,
        actorType: 'user',
        actorId: 'inventory-admin',
        deviceId: null,
        deviceType: null,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 2,
        reservedQuantity: 2,
        details: { action: 'INVENTORY_RESERVED', orderId: 'ORDER-1' },
        timestamp: '2026-06-11T12:02:00.000Z',
        chainSequence: 2,
        eventHash: 'hash-2',
      }],
      scanHistory: [{
        eventId: '88888888-8888-4888-8888-888888888888',
        action: 'INVENTORY_SCANNED' as const,
        actorType: 'device',
        actorId: 'scanner-1',
        deviceId: 'scanner-1',
        deviceType: 'scanner',
        locationId: 'AUSTIN-B2',
        locationName: 'Austin Warehouse - Aisle B2',
        quantity: 2,
        reservedQuantity: 2,
        details: { action: 'INVENTORY_SCANNED', accepted: false },
        timestamp: '2026-06-11T12:03:00.000Z',
        chainSequence: 3,
        eventHash: 'hash-3',
      }],
    }));
    const anomaly = {
      id: `${item.id}:low_stock`,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      type: 'low_stock' as const,
      severity: 'warning' as const,
      status: 'open' as const,
      message: 'Low stock',
      locationId: item.locationId,
      locationName: item.locationName,
      detectedAt: item.updatedAt,
      remediation: 'Replenish inventory.',
      details: { quantity: 4, minimumQuantity: 5 },
    };
    anomaliesMock = vi.fn(() => of({ anomalies: [anomaly], total: 1 }));
    detectAnomaliesMock = vi.fn(() => of({ anomalies: [anomaly], total: 1 }));
    const alert = {
      id: `${item.id}:low_stock:low_stock`,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      type: 'low_stock' as const,
      severity: 'warning' as const,
      message: 'Low stock',
      locationId: item.locationId,
      locationName: item.locationName,
      createdAt: item.updatedAt,
      action: 'Replenish inventory.',
      details: { quantity: 4, minimumQuantity: 5 },
    };
    alertsMock = vi.fn(() => of({ alerts: [alert], total: 1 }));
    generateAlertsMock = vi.fn(() => of({ alerts: [alert], total: 1 }));
    await TestBed.configureTestingModule({
      imports: [InventoryModule],
      providers: [
        { provide: InventoryService, useValue: {
          listInventory: listMock,
          addInventory: addMock,
          importInventory: importMock,
          reserveInventory: reserveMock,
          releaseInventory: releaseMock,
          releaseExpiredReservations: releaseExpiredMock,
          moveInventory: moveMock,
          moveInventoryBatch: bulkMoveMock,
          adjustInventoryQuantity: adjustQuantityMock,
          changeInventoryStatus: changeStatusMock,
          removeInventory: removeMock,
          scanInventory: scanMock,
          scanInventoryBatch: batchScanMock,
          getInventoryItem: detailMock,
          getInventoryItemWithProvenance: provenanceMock,
          getProvenance: provenanceMock,
          getAnomalies: anomaliesMock,
          detectAnomalies: detectAnomaliesMock,
          getAlerts: alertsMock,
          generateAlerts: generateAlertsMock,
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders inventory and exposes a non-color low stock label', () => {
    expect(fixture.nativeElement.textContent).toContain('SKU-LOW');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="low-stock-label"]')?.textContent).toContain('Low stock');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-dashboard"]')?.textContent)
      .toContain('Inventory dashboard');
  });

  it('submits valid inventory and reloads the list', () => {
    component.addForm.setValue({
      sku: 'sku-new',
      name: 'New item',
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
      quantity: 10,
      unitOfMeasure: 'box',
    });
    component.addInventory();
    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({ sku: 'SKU-NEW', quantity: 10 }));
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(component.success).toContain('SKU-LOW added');
  });

  it('imports CSV inventory rows and displays per-row results', () => {
    component.importForm.setValue({
      payload: [
        'sku,name,locationId,locationName,quantity,unitOfMeasure',
        'sku-import-1,Imported sensor one,AUSTIN-A1,Austin Warehouse - Aisle A1,6,each',
        'sku-100,Duplicate sensor,AUSTIN-A1,Austin Warehouse - Aisle A1,4,each',
      ].join('\n'),
    });

    component.importInventoryBatch();

    expect(importMock).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({ sku: 'SKU-IMPORT-1', name: 'Imported sensor one', quantity: 6 }),
        expect.objectContaining({ sku: 'SKU-100', name: 'Duplicate sensor', quantity: 4 }),
      ],
    });
    expect(component.success).toBe('1 of 2 inventory items imported.');
    expect(component.importResults).toHaveLength(2);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="inventory-import-result"]')).toHaveLength(2);

    component.importForm.setValue({ payload: 'sku,name,locationId,locationName,quantity,unitOfMeasure\nbad,Bad,AUSTIN-A1,Austin,NaN,each' });
    component.importInventoryBatch();
    expect(component.error).toBe('Imported inventory quantity must be a non-negative integer.');
  });

  it('applies and resets list filters and validates negative quantities', () => {
    component.filtersForm.patchValue({ query: 'sensor', locationId: 'AUSTIN-A1', status: 'available', sortBy: 'quantity', sortDirection: 'asc' });
    component.applyFilters();
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({
      query: 'sensor',
      locationId: 'AUSTIN-A1',
      status: 'available',
      sortBy: 'quantity',
      sortDirection: 'asc',
    }));

    component.addForm.patchValue({ quantity: -1 });
    component.addInventory();
    expect(component.error).toContain('non-negative quantity');
    component.resetFilters();
    expect(component.filtersForm.getRawValue()).toMatchObject({ query: '', locationId: '', status: '' });
  });

  it('reserves and releases inventory and validates reservation quantity', () => {
    component.reserve(item, '2', '', '15');
    expect(reserveMock).toHaveBeenCalledWith(item.id, { quantity: 2, timeoutMinutes: 15 });
    expect(component.success).toContain('2 each reserved');

    component.release({ ...item, status: 'reserved', quantity: 2, reservedQuantity: 2 });
    expect(releaseMock).toHaveBeenCalledWith(item.id);
    expect(component.success).toContain('reservation released');

    component.reserve(item, '5', '');
    expect(component.error).toContain('between 1 and 4');
    component.reserve(item, '1', '', '0');
    expect(component.error).toContain('Reservation timeout');
  });

  it('releases expired reservations and reloads inventory', () => {
    component.releaseExpiredReservations();

    expect(releaseExpiredMock).toHaveBeenCalledOnce();
    expect(component.success).toBe('1 expired inventory reservations released.');
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('moves inventory and requires complete destination fields', () => {
    component.move(item, 'AUSTIN-B2', 'Austin Warehouse - Aisle B2');
    expect(moveMock).toHaveBeenCalledWith(item.id, {
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
    });
    expect(component.success).toContain('moved to Austin Warehouse - Aisle B2');

    component.move(item, '', 'Missing ID');
    expect(component.error).toContain('both a destination location ID and name');
  });

  it('submits newline-delimited bulk moves and displays per-item results', () => {
    component.bulkMoveForm.setValue({
      itemIds: `${item.id}\n\n66666666-6666-4666-8666-666666666666`,
      locationId: 'AUSTIN-C3',
      locationName: 'Austin Warehouse - Aisle C3',
      reason: 'Bulk rebalance',
    });
    component.moveInventoryBatch();

    expect(bulkMoveMock).toHaveBeenCalledWith({
      itemIds: [item.id, '66666666-6666-4666-8666-666666666666'],
      locationId: 'AUSTIN-C3',
      locationName: 'Austin Warehouse - Aisle C3',
      reason: 'Bulk rebalance',
    });
    expect(component.success).toContain('1 of 2 inventory items moved');
    expect(component.bulkMoveResults).toHaveLength(2);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="inventory-bulk-move-result"]')).toHaveLength(2);

    component.bulkMoveForm.patchValue({ itemIds: ' ' });
    component.moveInventoryBatch();
    expect(component.error).toContain('between 1 and 100');
  });

  it('adjusts inventory quantity and validates the required reason', () => {
    component.adjustQuantity(item, '8', 'Cycle count reconciliation');
    expect(adjustQuantityMock).toHaveBeenCalledWith(item.id, {
      quantity: 8,
      reason: 'Cycle count reconciliation',
    });
    expect(component.success).toContain('quantity adjusted to 8 each');

    component.adjustQuantity({ ...item, reservedQuantity: 2 }, '1', 'Too low');
    expect(component.error).toContain('at least 2');

    component.adjustQuantity(item, '8', ' ');
    expect(component.error).toContain('quantity adjustment reason is required');
  });

  it('changes inventory status and blocks workflow-owned statuses', () => {
    component.changeStatus(item, 'damaged', 'Quality hold');
    expect(changeStatusMock).toHaveBeenCalledWith(item.id, {
      status: 'damaged',
      reason: 'Quality hold',
    });
    expect(component.success).toContain('status changed to damaged');

    component.changeStatus(item, 'reserved', 'Invalid');
    expect(component.error).toContain('Use reservation or removal controls');

    component.changeStatus(item, 'expired', ' ');
    expect(component.error).toContain('status change reason is required');
  });

  it('removes inventory and requires a reason', () => {
    component.remove(item, 'Damaged beyond repair');
    expect(removeMock).toHaveBeenCalledWith(item.id, { reason: 'Damaged beyond repair' });
    expect(component.success).toContain('removed from active inventory');

    component.remove(item, ' ');
    expect(component.error).toContain('removal reason is required');
  });

  it('submits inventory scans and requires a SKU or serial number', () => {
    component.scanForm.setValue({ value: ' SKU-LOW ', scanType: 'barcode', locationId: 'AUSTIN-A1' });
    component.scanInventory();
    expect(scanMock).toHaveBeenCalledWith({
      value: 'SKU-LOW',
      scanType: 'barcode',
      locationId: 'AUSTIN-A1',
    });
    expect(component.scanFeedbackState).toBe('accepted');
    expect(component.success).toContain('scan accepted');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-scan-feedback"]')?.textContent)
      .toContain('Scan accepted');

    component.scanForm.patchValue({ value: '' });
    component.scanInventory();
    expect(component.error).toContain('SKU or serial number');
  });

  it('uses camera scan detection when the browser supports barcode detection', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: ' SKU-CAMERA ' }]);
    class MockBarcodeDetector {
      detect = detect;
    }
    vi.stubGlobal('BarcodeDetector', MockBarcodeDetector);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({}));
    component.refreshCameraScanAvailability();

    expect(component.cameraScanAvailable).toBe(true);

    const file = new File(['scan'], 'scan.png', { type: 'image/png' });
    const input = { files: [file], value: 'scan.png' } as unknown as HTMLInputElement;

    await component.handleCameraScanFile({ target: input } as unknown as Event);

    expect(component.scanForm.controls.value.value).toBe('SKU-CAMERA');
    expect(component.scanForm.controls.scanType.value).toBe('barcode');
    expect(component.success).toContain('Camera scan detected SKU-CAMERA');
    expect(component.cameraScanning).toBe(false);
    expect(input.value).toBe('');
    expect(detect).toHaveBeenCalled();
  });

  it('keeps camera scan hidden and reports unsupported browsers', () => {
    vi.stubGlobal('BarcodeDetector', undefined);
    component.refreshCameraScanAvailability();

    expect(component.cameraScanAvailable).toBe(false);

    const input = { click: vi.fn() } as unknown as HTMLInputElement;
    component.startCameraScan(input);

    expect(input.click).not.toHaveBeenCalled();
    expect(component.error).toContain('Camera barcode scanning is not available');
  });

  it('shows an explicit wrong-location scan rejection', () => {
    scanMock.mockReturnValueOnce(throwError(() => new Error('Inventory item SKU-LOW expected at AUSTIN-A1, not AUSTIN-B2')));
    component.scanForm.setValue({ value: 'SKU-LOW', scanType: 'manual', locationId: 'AUSTIN-B2' });
    component.scanInventory();

    expect(component.error).toContain('expected at AUSTIN-A1, not AUSTIN-B2');
    expect(component.scanFeedbackState).toBe('rejected');
    expect(component.operatingItemId).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-scan-feedback"]')?.textContent)
      .toContain('Scan rejected');
  });

  it('submits newline-delimited bulk scans and displays accepted and rejected results', () => {
    component.batchScanForm.setValue({
      values: ' SKU-LOW \n\nUNKNOWN ',
      scanType: 'barcode',
      locationId: 'AUSTIN-A1',
    });
    component.scanInventoryBatch();

    expect(batchScanMock).toHaveBeenCalledWith({
      scans: [
        { value: 'SKU-LOW', scanType: 'barcode', locationId: 'AUSTIN-A1' },
        { value: 'UNKNOWN', scanType: 'barcode', locationId: 'AUSTIN-A1' },
      ],
    });
    expect(component.success).toContain('1 of 2 bulk inventory scans accepted');
    expect(component.batchScanResults).toHaveLength(2);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="inventory-batch-scan-result"]')).toHaveLength(2);

    component.batchScanForm.patchValue({ values: ' ' });
    component.scanInventoryBatch();
    expect(component.error).toContain('between 1 and 100');
  });

  it('loads inventory provenance into the shared timeline model', () => {
    component.loadProvenance(item);
    expect(provenanceMock).toHaveBeenCalledWith(item.id);
    expect(component.provenanceEntries).toEqual([{
      title: 'INVENTORY_ADDED',
      timestamp: '2026-06-11T12:00:00.000Z',
      state: 'done',
    }]);
    expect(component.provenanceDiagramEntries).toEqual([
      {
        id: '66666666-6666-4666-8666-666666666666',
        movement: 'Added',
        actor: 'user / inventory-admin',
        location: 'Austin Warehouse - Aisle A1',
        quantity: '4 each',
        anomalyState: 'clear',
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        movement: 'Rejected scan',
        actor: 'device / scanner-1',
        location: 'Austin Warehouse - Aisle B2',
        quantity: '2 each',
        anomalyState: 'anomaly',
      },
    ]);
    expect(component.provenanceLocationEntries).toEqual([
      {
        id: '66666666-6666-4666-8666-666666666666',
        step: 1,
        location: 'Austin Warehouse - Aisle A1',
        movement: 'Added',
        actor: 'user / inventory-admin',
        anomalyState: 'clear',
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        step: 2,
        location: 'Austin Warehouse - Aisle B2',
        movement: 'Rejected scan',
        actor: 'device / scanner-1',
        anomalyState: 'anomaly',
      },
    ]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-provenance-diagram"]')?.textContent)
      .toContain('Rejected scan');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-location-history-diagram"]')?.textContent)
      .toContain('Step 2');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-reservation-history"]')?.textContent)
      .toContain('INVENTORY_RESERVED');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-scan-history"]')?.textContent)
      .toContain('Rejected scan');
  });

  it('loads and closes full inventory detail with provenance', () => {
    component.loadDetail(item);
    expect(detailMock).not.toHaveBeenCalled();
    expect(provenanceMock).toHaveBeenCalledWith(item.id);
    expect(component.selectedItem).toMatchObject({ description: 'Serialized warehouse sensor', serialNumber: 'SERIAL-001' });
    expect(component.provenance).toEqual(expect.objectContaining({
      events: [expect.objectContaining({ action: 'INVENTORY_ADDED' })],
    }));

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-detail"]')?.textContent)
      .toContain('SERIAL-001');

    component.closeDetail();
    expect(component.selectedItem).toBeNull();
    expect(component.provenance).toBeNull();
  });

  it('runs reserve, release, move, and remove actions from the detail view', () => {
    component.loadDetail(item);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const detailActions = host.querySelector('[data-testid="inventory-detail-actions"]') as HTMLElement;
    const reserveInput = detailActions.querySelector<HTMLInputElement>('input[type="number"]');
    expect(reserveInput).not.toBeNull();
    reserveInput?.setAttribute('value', '2');
    if (reserveInput) reserveInput.value = '2';
    detailActions.querySelector<HTMLButtonElement>('[data-testid="detail-reserve-inventory"]')?.click();
    expect(reserveMock).toHaveBeenCalledWith(item.id, { quantity: 2 });
    expect(component.selectedItem).toMatchObject({ status: 'reserved', reservedQuantity: 2 });

    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="detail-release-inventory"]')?.click();
    expect(releaseMock).toHaveBeenCalledWith(item.id);
    expect(component.selectedItem).toMatchObject({ status: 'available', reservedQuantity: 0 });

    component.loadDetail(item);
    fixture.detectChanges();
    const moveInputs = Array.from(host.querySelectorAll<HTMLInputElement>('[data-testid="inventory-detail-actions"] .move-controls input'));
    moveInputs[0].value = 'AUSTIN-B2';
    moveInputs[1].value = 'Austin Warehouse - Aisle B2';
    host.querySelector<HTMLButtonElement>('[data-testid="detail-move-inventory"]')?.click();
    expect(moveMock).toHaveBeenCalledWith(item.id, {
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
    });
    expect(component.selectedItem).toMatchObject({ locationId: 'AUSTIN-B2' });

    component.loadDetail(item);
    fixture.detectChanges();
    const removalInput = host.querySelector<HTMLInputElement>('[data-testid="inventory-detail-actions"] .removal-controls input');
    expect(removalInput).not.toBeNull();
    if (removalInput) removalInput.value = 'Damaged beyond repair';
    host.querySelector<HTMLButtonElement>('[data-testid="detail-remove-inventory"]')?.click();
    expect(removeMock).toHaveBeenCalledWith(item.id, { reason: 'Damaged beyond repair' });
    expect(component.selectedItem).toMatchObject({ status: 'removed', removalReason: 'Damaged beyond repair' });
  });

  it('filters anomalies and records detected findings with non-color labels', () => {
    component.anomalyFiltersForm.setValue({
      type: 'quantity_discrepancy',
      severity: 'warning',
      detectedFrom: '2026-06-01',
      detectedTo: '2026-06-30',
    });
    component.loadAnomalies();
    expect(anomaliesMock).toHaveBeenCalledWith({
      type: 'quantity_discrepancy',
      severity: 'warning',
      detectedFrom: '2026-06-01',
      detectedTo: '2026-06-30',
    });
    expect(component.anomalies[0]).toMatchObject({ severity: 'warning', status: 'open' });

    component.detectAnomalies();
    expect(detectAnomaliesMock).toHaveBeenCalled();
    expect(component.success).toContain('1 inventory anomalies detected');

    component.resolveAnomaly(component.anomalies[0]);
    expect(component.anomalies[0]).toMatchObject({ status: 'resolved' });
    expect(component.success).toContain('SKU-LOW: anomaly marked resolved');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-anomaly-card"]')?.textContent)
      .toContain('Status: resolved');
  });

  it('filters and generates actionable inventory alerts', () => {
    component.alertFiltersForm.setValue({ type: 'low_stock', severity: 'warning' });
    component.loadAlerts();
    expect(alertsMock).toHaveBeenCalledWith({ type: 'low_stock', severity: 'warning' });
    expect(component.alerts[0]).toMatchObject({ type: 'low_stock', action: 'Replenish inventory.' });

    component.generateAlerts();
    expect(generateAlertsMock).toHaveBeenCalled();
    expect(component.success).toContain('1 inventory alerts generated');
    expect(component.toastMessage).toBe('1 inventory alerts generated and recorded.');
    expect(component.toastTone).toBe('success');
  });

  it('opens error toaster notifications for inventory validation failures', () => {
    component.reserve(item, '0', '');

    expect(component.error).toContain('Reservation quantity must be between 1 and 4.');
    expect(component.toastMessage).toBe('Reservation quantity must be between 1 and 4.');
    expect(component.toastTone).toBe('error');

    component.dismissToast();
    expect(component.toastMessage).toBeNull();
  });

  it('refreshes inventory and runs dashboard quick actions', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-refresh"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-alerts"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-anomalies"]')?.click();

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(generateAlertsMock).toHaveBeenCalled();
    expect(detectAnomaliesMock).toHaveBeenCalled();
  });
});
