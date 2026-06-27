import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { DevicesService } from '../../devices.service';
import { InventoryService } from '../../inventory.service';

export interface DashboardOperationsSnapshot {
  activeConnections: number;
  openAnomalies: number;
  deviceHeartbeat: {
    total: number;
    online: number;
    missing: number;
  };
  source: 'api' | 'approved-fixture';
}

export const APPROVED_DEMO_OPERATIONS_SNAPSHOT: DashboardOperationsSnapshot = {
  activeConnections: 0,
  openAnomalies: 0,
  deviceHeartbeat: {
    total: 0,
    online: 0,
    missing: 0,
  },
  source: 'approved-fixture',
};

@Injectable({ providedIn: 'root' })
export class DashboardOperationsService {
  private readonly http = inject(HttpClient);
  private readonly inventoryService = inject(InventoryService);
  private readonly devicesService = inject(DevicesService);

  fetchSnapshot(): Observable<DashboardOperationsSnapshot> {
    return forkJoin({
      metrics: this.http.get('/api/metrics', { responseType: 'text' }).pipe(
        map((metrics) => this.parseActiveConnections(metrics)),
        catchError(() => of(APPROVED_DEMO_OPERATIONS_SNAPSHOT.activeConnections)),
      ),
      anomalies: this.inventoryService.getAnomalies().pipe(
        map((response) => response.total),
        catchError(() => of(APPROVED_DEMO_OPERATIONS_SNAPSHOT.openAnomalies)),
      ),
      devices: this.devicesService.listDevices({ page: 1, pageSize: 100 }).pipe(
        map((response) => {
          const online = response.devices.filter((device) => device.online).length;
          return {
            total: response.total,
            online,
            missing: Math.max(0, response.total - online),
          };
        }),
        catchError(() => of(APPROVED_DEMO_OPERATIONS_SNAPSHOT.deviceHeartbeat)),
      ),
    }).pipe(
      map(({ metrics, anomalies, devices }) => ({
        activeConnections: metrics,
        openAnomalies: anomalies,
        deviceHeartbeat: devices,
        source: 'api' as const,
      })),
      catchError(() => of(APPROVED_DEMO_OPERATIONS_SNAPSHOT)),
    );
  }

  parseActiveConnections(metrics: string): number {
    const match = metrics.match(/^true_north_ledger_websocket_connections_active\s+(\d+(?:\.\d+)?)$/m);
    return match ? Number(match[1]) : 0;
  }
}
