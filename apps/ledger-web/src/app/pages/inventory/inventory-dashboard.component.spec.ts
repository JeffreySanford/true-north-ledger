import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { InventoryAlert, InventoryAnomaly, InventoryItem } from '@true-north-ledger/inventory-contracts';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { InventoryDashboardComponent } from './inventory-dashboard.component';

const baseItem: InventoryItem = {
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
  expirationDate: '2026-07-01',
  metadata: { minimumQuantity: 5 },
  createdAt: '2026-06-11T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  lastScannedAt: '2026-06-12T05:00:00.000Z',
  removalReason: null,
  removedAt: null,
};

const anomaly: InventoryAnomaly = {
  id: `${baseItem.id}:low_stock`,
  itemId: baseItem.id,
  sku: baseItem.sku,
  name: baseItem.name,
  type: 'low_stock',
  severity: 'warning',
  status: 'open',
  message: 'Low stock',
  locationId: baseItem.locationId,
  locationName: baseItem.locationName,
  detectedAt: '2026-06-12T06:00:00.000Z',
  remediation: 'Replenish inventory.',
  details: { quantity: 4, minimumQuantity: 5 },
};

const alert: InventoryAlert = {
  id: `${baseItem.id}:low_stock:low_stock`,
  itemId: baseItem.id,
  sku: baseItem.sku,
  name: baseItem.name,
  type: 'low_stock',
  severity: 'warning',
  message: 'Low stock',
  locationId: baseItem.locationId,
  locationName: baseItem.locationName,
  createdAt: '2026-06-12T06:00:00.000Z',
  action: 'Replenish inventory.',
  details: { quantity: 4, minimumQuantity: 5 },
};

describe('InventoryDashboardComponent', () => {
  let fixture: ComponentFixture<InventoryDashboardComponent>;
  let component: InventoryDashboardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InventoryDashboardComponent, EmptyStateComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(InventoryDashboardComponent);
    component = fixture.componentInstance;
  });

  it('renders status, health, location, recent scan, and anomaly metrics', () => {
    component.items = [
      baseItem,
      { ...baseItem, id: '66666666-6666-4666-8666-666666666666', sku: 'SKU-RSV', status: 'reserved', quantity: 8, expirationDate: null },
    ];
    component.total = 2;
    component.alerts = [alert];
    component.anomalies = [anomaly];
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('2 total tenant items');
    expect(text).toContain('Low stock');
    expect(text).toContain('Expiring soon');
    expect(text).toContain('Open anomalies');
    expect(text).toContain('Austin Warehouse - Aisle A1');
    expect(text).toContain('SKU-LOW | Austin Warehouse - Aisle A1');
    expect(text).toContain('warning SKU-LOW | low_stock');
  });

  it('emits quick actions from dashboard controls', () => {
    const refreshSpy = vi.fn();
    const alertSpy = vi.fn();
    const anomalySpy = vi.fn();
    component.refreshInventory.subscribe(refreshSpy);
    component.generateAlerts.subscribe(alertSpy);
    component.detectAnomalies.subscribe(anomalySpy);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-refresh"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-alerts"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="dashboard-anomalies"]')?.click();

    expect(refreshSpy).toHaveBeenCalledOnce();
    expect(alertSpy).toHaveBeenCalledOnce();
    expect(anomalySpy).toHaveBeenCalledOnce();
  });

  it('uses shared empty-state primitives for zero-data dashboard sections', () => {
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const emptyStates = Array.from(host.querySelectorAll('[data-testid="empty-state"]'));

    expect(emptyStates).toHaveLength(3);
    expect(host.querySelector('[data-testid="dashboard-locations"]')?.textContent).toContain('No location inventory loaded');
    expect(host.querySelector('[data-testid="dashboard-recent-scans"]')?.textContent).toContain('No recent scans loaded');
    expect(host.querySelector('[data-testid="dashboard-recent-anomalies"]')?.textContent).toContain('No anomalies loaded');
  });

  it('marks high-risk health and status metrics without relying on color alone', () => {
    component.items = [
      { ...baseItem, id: '66666666-6666-4666-8666-666666666666', sku: 'SKU-DMG', status: 'damaged', quantity: 1, expirationDate: null },
      { ...baseItem, id: '77777777-7777-4777-8777-777777777777', sku: 'SKU-EXP', status: 'expired', quantity: 0, expirationDate: '2026-06-01' },
    ];
    component.anomalies = [{ ...anomaly, severity: 'critical', detectedAt: '2026-06-13T06:00:00.000Z' }];
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const riskMetrics = Array.from(host.querySelectorAll('.metric-risk'));

    expect(host.querySelector('[data-testid="dashboard-status"]')?.textContent).toContain('damaged');
    expect(host.querySelector('[data-testid="dashboard-status"]')?.textContent).toContain('expired');
    expect(host.querySelector('[data-testid="dashboard-health"]')?.textContent).toContain('Open anomalies');
    expect(riskMetrics.map((metric) => metric.textContent?.trim())).toEqual(expect.arrayContaining([
      expect.stringContaining('damaged'),
      expect.stringContaining('expired'),
      expect.stringContaining('Open anomalies'),
    ]));
  });

  it('shows mixed alert and anomaly state with newest anomaly first', () => {
    component.alerts = [alert, { ...alert, id: `${baseItem.id}:expiring_soon`, type: 'expiring_soon', message: 'Expires soon' }];
    component.anomalies = [
      { ...anomaly, id: `${baseItem.id}:older`, severity: 'warning', type: 'low_stock', detectedAt: '2026-06-12T06:00:00.000Z' },
      { ...anomaly, id: `${baseItem.id}:newer`, severity: 'critical', type: 'quantity_discrepancy', detectedAt: '2026-06-13T06:00:00.000Z' },
    ];
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const anomalyItems = Array.from(host.querySelectorAll('[data-testid="dashboard-recent-anomalies"] li'));

    expect(host.querySelector('[data-testid="dashboard-health"]')?.textContent).toContain('2Active alerts');
    expect(anomalyItems[0]?.textContent).toContain('critical SKU-LOW | quantity_discrepancy');
    expect(anomalyItems[1]?.textContent).toContain('warning SKU-LOW | low_stock');
  });

  it('disables quick action controls while matching operations are loading', () => {
    component.loading = true;
    component.alertLoading = true;
    component.anomalyLoading = true;
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLButtonElement>('[data-testid="dashboard-refresh"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="dashboard-alerts"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="dashboard-anomalies"]')?.disabled).toBe(true);
  });
});
