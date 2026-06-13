import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
  let reserveMock: ReturnType<typeof vi.fn>;
  let releaseMock: ReturnType<typeof vi.fn>;
  let moveMock: ReturnType<typeof vi.fn>;
  let removeMock: ReturnType<typeof vi.fn>;
  let scanMock: ReturnType<typeof vi.fn>;
  let detailMock: ReturnType<typeof vi.fn>;
  let provenanceMock: ReturnType<typeof vi.fn>;
  let anomaliesMock: ReturnType<typeof vi.fn>;
  let detectAnomaliesMock: ReturnType<typeof vi.fn>;
  let alertsMock: ReturnType<typeof vi.fn>;
  let generateAlertsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listMock = vi.fn(() => of({ items: [item], total: 1, page: 1, pageSize: 10 }));
    addMock = vi.fn(() => of(item));
    reserveMock = vi.fn(() => of({ ...item, quantity: 2, reservedQuantity: 2, status: 'reserved' as const }));
    releaseMock = vi.fn(() => of(item));
    moveMock = vi.fn(() => of({ ...item, locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' }));
    removeMock = vi.fn(() => of({
      ...item,
      quantity: 0,
      status: 'removed' as const,
      removalReason: 'Damaged beyond repair',
      removedAt: '2026-06-12T04:10:00.000Z',
    }));
    scanMock = vi.fn(() => of({ ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' }));
    detailMock = vi.fn(() => of({
      ...item,
      description: 'Serialized warehouse sensor',
      batchNumber: 'LOT-42',
      serialNumber: 'SERIAL-001',
    }));
    provenanceMock = vi.fn(() => of({
      item,
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
      providers: [{ provide: InventoryService, useValue: {
        listInventory: listMock,
        addInventory: addMock,
        reserveInventory: reserveMock,
        releaseInventory: releaseMock,
        moveInventory: moveMock,
        removeInventory: removeMock,
        scanInventory: scanMock,
        getInventoryItem: detailMock,
        getProvenance: provenanceMock,
        getAnomalies: anomaliesMock,
        detectAnomalies: detectAnomaliesMock,
        getAlerts: alertsMock,
        generateAlerts: generateAlertsMock,
      } }],
    }).compileComponents();
    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders inventory and exposes a non-color low stock label', () => {
    expect(fixture.nativeElement.textContent).toContain('SKU-LOW');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="low-stock-label"]')?.textContent).toContain('Low stock');
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
    component.reserve(item, '2', '');
    expect(reserveMock).toHaveBeenCalledWith(item.id, { quantity: 2 });
    expect(component.success).toContain('2 each reserved');

    component.release({ ...item, status: 'reserved', quantity: 2, reservedQuantity: 2 });
    expect(releaseMock).toHaveBeenCalledWith(item.id);
    expect(component.success).toContain('reservation released');

    component.reserve(item, '5', '');
    expect(component.error).toContain('between 1 and 4');
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
    expect(component.success).toContain('scan accepted');

    component.scanForm.patchValue({ value: '' });
    component.scanInventory();
    expect(component.error).toContain('SKU or serial number');
  });

  it('loads inventory provenance into the shared timeline model', () => {
    component.loadProvenance(item);
    expect(provenanceMock).toHaveBeenCalledWith(item.id);
    expect(component.provenanceEntries).toEqual([{
      title: 'INVENTORY_ADDED',
      timestamp: '2026-06-11T12:00:00.000Z',
      state: 'done',
    }]);
  });

  it('loads and closes full inventory detail with provenance', () => {
    component.loadDetail(item);
    expect(detailMock).toHaveBeenCalledWith(item.id);
    expect(provenanceMock).toHaveBeenCalledWith(item.id);
    expect(component.selectedItem).toMatchObject({ description: 'Serialized warehouse sensor', serialNumber: 'SERIAL-001' });

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-detail"]')?.textContent)
      .toContain('SERIAL-001');

    component.closeDetail();
    expect(component.selectedItem).toBeNull();
    expect(component.provenance).toBeNull();
  });

  it('filters anomalies and records detected findings with non-color labels', () => {
    component.anomalyFiltersForm.setValue({ type: 'low_stock', severity: 'warning' });
    component.loadAnomalies();
    expect(anomaliesMock).toHaveBeenCalledWith({ type: 'low_stock', severity: 'warning' });
    expect(component.anomalies[0]).toMatchObject({ severity: 'warning', status: 'open' });

    component.detectAnomalies();
    expect(detectAnomaliesMock).toHaveBeenCalled();
    expect(component.success).toContain('1 inventory anomalies detected');
  });

  it('filters and generates actionable inventory alerts', () => {
    component.alertFiltersForm.setValue({ type: 'low_stock', severity: 'warning' });
    component.loadAlerts();
    expect(alertsMock).toHaveBeenCalledWith({ type: 'low_stock', severity: 'warning' });
    expect(component.alerts[0]).toMatchObject({ type: 'low_stock', action: 'Replenish inventory.' });

    component.generateAlerts();
    expect(generateAlertsMock).toHaveBeenCalled();
    expect(component.success).toContain('1 inventory alerts generated');
  });
});
