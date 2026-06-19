import { Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  InventoryAlert,
  InventoryAnomaly,
  InventoryItem,
  InventoryProvenanceResponse,
  InventoryStatus,
} from '@true-north-ledger/inventory-contracts';

type HealthState = 'good' | 'watch' | 'risk';

interface DashboardMetric {
  label: string;
  value: number;
  state: HealthState;
}

@Component({
  standalone: false,
  selector: 'tnl-inventory-dashboard',
  templateUrl: './inventory-dashboard.component.html',
  styleUrls: ['./inventory-dashboard.component.scss'],
})
export class InventoryDashboardComponent {
  @Input() items: InventoryItem[] = [];
  @Input() total = 0;
  @Input() alerts: InventoryAlert[] = [];
  @Input() anomalies: InventoryAnomaly[] = [];
  @Input() provenance: InventoryProvenanceResponse | null = null;
  @Input() loading = false;
  @Input() alertLoading = false;
  @Input() anomalyLoading = false;

  @Output() refreshInventory = new EventEmitter<void>();
  @Output() generateAlerts = new EventEmitter<void>();
  @Output() detectAnomalies = new EventEmitter<void>();

  readonly statuses: InventoryStatus[] = ['available', 'reserved', 'in_transit', 'damaged', 'expired', 'removed'];

  get statusMetrics(): DashboardMetric[] {
    return this.statuses.map((status) => ({
      label: status,
      value: this.items.filter((item) => item.status === status).length,
      state: this.statusState(status),
    }));
  }

  get locationMetrics(): DashboardMetric[] {
    const counts = new Map<string, number>();
    this.items.forEach((item) => counts.set(item.locationName, (counts.get(item.locationName) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([label, value]) => ({ label, value, state: 'good' }));
  }

  get lowStockCount(): number {
    return this.items.filter((item) => item.status !== 'removed' && item.quantity <= this.minimumQuantity(item)).length;
  }

  get expiringSoonCount(): number {
    const today = new Date('2026-06-18T00:00:00.000Z');
    const soon = new Date(today);
    soon.setUTCDate(soon.getUTCDate() + 30);
    return this.items.filter((item) => {
      if (!item.expirationDate || item.status === 'removed') return false;
      const expiration = new Date(`${item.expirationDate}T00:00:00.000Z`);
      return expiration >= today && expiration <= soon;
    }).length;
  }

  get recentAnomalies(): InventoryAnomaly[] {
    return [...this.anomalies].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 3);
  }

  get recentScans(): InventoryItem[] {
    return this.items
      .filter((item) => Boolean(item.lastScannedAt))
      .sort((a, b) => (b.lastScannedAt ?? '').localeCompare(a.lastScannedAt ?? ''))
      .slice(0, 3);
  }

  get provenanceScanLabels(): string[] {
    return this.provenance?.scanHistory.slice(0, 3).map((event) => {
      const result = event.details['accepted'] === false ? 'Rejected' : 'Accepted';
      return `${result} scan by ${event.actorType} / ${event.actorId}`;
    }) ?? [];
  }

  get healthMetrics(): DashboardMetric[] {
    return [
      { label: 'Low stock', value: this.lowStockCount, state: this.lowStockCount > 0 ? 'watch' : 'good' },
      { label: 'Expiring soon', value: this.expiringSoonCount, state: this.expiringSoonCount > 0 ? 'watch' : 'good' },
      { label: 'Open anomalies', value: this.anomalies.length, state: this.anomalies.length > 0 ? 'risk' : 'good' },
      { label: 'Active alerts', value: this.alerts.length, state: this.alerts.length > 0 ? 'watch' : 'good' },
    ];
  }

  private minimumQuantity(item: InventoryItem): number {
    const minimumQuantity = item.metadata['minimumQuantity'];
    return typeof minimumQuantity === 'number' && Number.isFinite(minimumQuantity) ? minimumQuantity : 5;
  }

  private statusState(status: InventoryStatus): HealthState {
    if (status === 'damaged' || status === 'expired') return 'risk';
    if (status === 'reserved' || status === 'in_transit') return 'watch';
    return 'good';
  }
}
