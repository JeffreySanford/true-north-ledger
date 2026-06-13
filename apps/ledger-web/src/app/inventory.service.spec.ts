import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { InventoryItem } from '@true-north-ledger/inventory-contracts';
import { InventoryService } from './inventory.service';

const item: InventoryItem = {
  id: '55555555-5555-4555-8555-555555555555',
  tenantId: '11111111-1111-4111-8111-111111111111',
  sku: 'SKU-100',
  name: 'Serialized sensor kit',
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

describe('InventoryService', () => {
  let service: InventoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('tnl.authToken', 'inventory-token');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [InventoryService] });
    service = TestBed.inject(InventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('tnl.authToken');
    http.verify();
  });

  it('lists inventory with filters and validates the response', () => {
    let response: unknown;
    service.listInventory({ status: 'available', locationId: 'AUSTIN-A1', page: 2, pageSize: 10 }).subscribe((value) => {
      response = value;
    });
    const request = http.expectOne('/api/v1/inventory?status=available&locationId=AUSTIN-A1&page=2&pageSize=10');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer inventory-token');
    request.flush({ items: [item], total: 11, page: 2, pageSize: 10 });
    expect(response).toEqual({ items: [item], total: 11, page: 2, pageSize: 10 });
  });

  it('adds inventory and rejects malformed server responses', () => {
    let created: unknown;
    service
      .addInventory({
        sku: 'SKU-100',
        name: 'Serialized sensor kit',
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 4,
        unitOfMeasure: 'each',
      })
      .subscribe((value) => {
        created = value;
      });
    const request = http.expectOne('/api/v1/inventory');
    expect(request.request.method).toBe('POST');
    request.flush(item);
    expect(created).toEqual(item);

    let error: unknown;
    service.listInventory().subscribe({ error: (value) => (error = value) });
    http.expectOne('/api/v1/inventory').flush({ items: [{ bad: true }], total: 1, page: 1, pageSize: 25 });
    expect(error).toBeInstanceOf(Error);
  });

  it('fetches inventory details by ID and encoded SKU', () => {
    let byId: unknown;
    service.getInventoryItem(item.id).subscribe((value) => (byId = value));
    const idRequest = http.expectOne(`/api/v1/inventory/${item.id}`);
    expect(idRequest.request.method).toBe('GET');
    idRequest.flush(item);
    expect(byId).toEqual(item);

    let bySku: unknown;
    service.getInventoryItemBySku(' SKU/100 ').subscribe((value) => (bySku = value));
    const skuRequest = http.expectOne('/api/v1/inventory/sku/SKU%2F100');
    expect(skuRequest.request.method).toBe('GET');
    skuRequest.flush(item);
    expect(bySku).toEqual(item);
  });

  it('reserves and releases inventory through typed endpoints', () => {
    let reserved: unknown;
    service.reserveInventory(item.id, { quantity: 2 }).subscribe((value) => (reserved = value));
    const reserveRequest = http.expectOne(`/api/v1/inventory/${item.id}/reserve`);
    expect(reserveRequest.request.method).toBe('PATCH');
    expect(reserveRequest.request.body).toEqual({ quantity: 2 });
    reserveRequest.flush({ ...item, quantity: 2, reservedQuantity: 2, status: 'reserved' });
    expect(reserved).toEqual(expect.objectContaining({ reservedQuantity: 2, status: 'reserved' }));

    let released: unknown;
    service.releaseInventory(item.id, { reason: 'Order cancelled' }).subscribe((value) => (released = value));
    const releaseRequest = http.expectOne(`/api/v1/inventory/${item.id}/release`);
    expect(releaseRequest.request.method).toBe('PATCH');
    expect(releaseRequest.request.body).toEqual({ reason: 'Order cancelled' });
    releaseRequest.flush(item);
    expect(released).toEqual(item);
  });

  it('moves inventory through the typed move endpoint', () => {
    let moved: unknown;
    service.moveInventory(item.id, { locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' })
      .subscribe((value) => (moved = value));
    const request = http.expectOne(`/api/v1/inventory/${item.id}/move`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' });
    request.flush({ ...item, locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' });
    expect(moved).toEqual(expect.objectContaining({ locationId: 'AUSTIN-B2' }));
  });

  it('soft-removes inventory through DELETE with a required reason body', () => {
    let removed: unknown;
    service.removeInventory(item.id, { reason: 'Damaged beyond repair' }).subscribe((value) => (removed = value));
    const request = http.expectOne(`/api/v1/inventory/${item.id}`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ reason: 'Damaged beyond repair' });
    request.flush({
      ...item,
      quantity: 0,
      status: 'removed',
      removalReason: 'Damaged beyond repair',
      removedAt: '2026-06-12T04:10:00.000Z',
    });
    expect(removed).toEqual(expect.objectContaining({ status: 'removed', quantity: 0 }));
  });

  it('submits a typed inventory scan and validates returned item details', () => {
    let scanned: unknown;
    service.scanInventory({ value: 'SKU-100', scanType: 'barcode', locationId: 'AUSTIN-A1' })
      .subscribe((value) => (scanned = value));
    const request = http.expectOne('/api/v1/inventory/scan');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ value: 'SKU-100', scanType: 'barcode', locationId: 'AUSTIN-A1' });
    request.flush({ ...item, lastScannedAt: '2026-06-12T05:00:00.000Z' });
    expect(scanned).toEqual(expect.objectContaining({ sku: 'SKU-100', lastScannedAt: expect.any(String) }));
  });

  it('fetches typed inventory provenance', () => {
    let provenance: unknown;
    service.getProvenance(item.id).subscribe((value) => (provenance = value));
    const request = http.expectOne(`/api/v1/inventory/${item.id}/provenance`);
    expect(request.request.method).toBe('GET');
    request.flush({
      item,
      events: [{
        eventId: '66666666-6666-4666-8666-666666666666',
        action: 'INVENTORY_ADDED',
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
    });
    expect(provenance).toEqual(expect.objectContaining({ events: [expect.objectContaining({ action: 'INVENTORY_ADDED' })] }));
  });

  it('lists filtered anomalies and explicitly runs ledger-backed detection', () => {
    const anomaly = {
      id: `${item.id}:low_stock`,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      type: 'low_stock',
      severity: 'warning',
      status: 'open',
      message: 'Low stock',
      locationId: item.locationId,
      locationName: item.locationName,
      detectedAt: item.updatedAt,
      remediation: 'Replenish inventory.',
      details: { quantity: 4, minimumQuantity: 5 },
    };
    let listed: unknown;
    service.getAnomalies({ type: 'low_stock', severity: 'warning' }).subscribe((value) => (listed = value));
    const listRequest = http.expectOne('/api/v1/inventory/anomalies?type=low_stock&severity=warning');
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush({ anomalies: [anomaly], total: 1 });
    expect(listed).toEqual({ anomalies: [anomaly], total: 1 });

    service.detectAnomalies().subscribe();
    const detectRequest = http.expectOne('/api/v1/inventory/anomalies/detect');
    expect(detectRequest.request.method).toBe('POST');
    detectRequest.flush({ anomalies: [anomaly], total: 1 });
  });

  it('lists filtered alerts and explicitly generates ledger-backed alerts', () => {
    const alert = {
      id: `${item.id}:low_stock:low_stock`,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      type: 'low_stock',
      severity: 'warning',
      message: 'Low stock',
      locationId: item.locationId,
      locationName: item.locationName,
      createdAt: item.updatedAt,
      action: 'Replenish inventory.',
      details: { quantity: 4, minimumQuantity: 5 },
    };
    let listed: unknown;
    service.getAlerts({ type: 'low_stock', severity: 'warning' }).subscribe((value) => (listed = value));
    const listRequest = http.expectOne('/api/v1/inventory/alerts?type=low_stock&severity=warning');
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush({ alerts: [alert], total: 1 });
    expect(listed).toEqual({ alerts: [alert], total: 1 });

    service.generateAlerts().subscribe();
    const generateRequest = http.expectOne('/api/v1/inventory/alerts/generate');
    expect(generateRequest.request.method).toBe('POST');
    generateRequest.flush({ alerts: [alert], total: 1 });
  });
});
