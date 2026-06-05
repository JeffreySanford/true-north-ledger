import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, skip, Subject, takeUntil } from 'rxjs';
import type { Device, DeviceStatus, LedgerEventResponse } from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';

interface DeviceHeartbeatHistoryItem {
  id: string;
  timestamp: string;
  status: string;
  metrics: string;
}

@Component({
  standalone: false,
  selector: 'tnl-device-detail',
  templateUrl: './device-detail.component.html',
  styleUrls: ['./device-detail.component.scss'],
})
export class DeviceDetailComponent implements OnInit, OnDestroy {
  public device: Device | null = null;
  public events: LedgerEventResponse[] = [];
  public heartbeatHistory: DeviceHeartbeatHistoryItem[] = [];
  public loading = false;
  public error: string | null = null;

  private readonly devicesService = inject(DevicesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly statusPollStop$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.statusPollStop$.next();
    this.statusPollStop$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = 'Device id is required';
      return;
    }

    this.loading = true;
    this.error = null;

    forkJoin({
      device: this.devicesService.getDeviceStatus(id),
      events: this.devicesService.getDeviceEvents(id),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ device, events }) => {
          this.device = device;
          this.events = events.slice(-50).reverse();
          this.heartbeatHistory = this.toHeartbeatHistory(events);
          this.loading = false;
          this.startStatusPolling(device.id);
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public backToRegistry(): void {
    void this.router.navigate(['/devices']);
  }

  public updateStatus(status: DeviceStatus): void {
    if (!this.device || this.device.status === 'revoked') {
      return;
    }

    this.devicesService
      .updateDeviceStatus(this.device.id, { status, reason: `Changed from detail page to ${status}` })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.device = updated;
          this.loadEvents(updated.id);
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public revoke(): void {
    if (!this.device || this.device.status === 'revoked') {
      return;
    }

    if (typeof window !== 'undefined' && !window.confirm(`Revoke ${this.device.name}?`)) {
      return;
    }

    this.devicesService
      .revokeDevice(this.device.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.device = updated;
          this.loadEvents(updated.id);
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public statusTone(device: Device): StatusChipTone {
    if (device.status === 'revoked' || device.status === 'suspended') {
      return 'error';
    }

    if (device.online) {
      return 'success';
    }

    return device.status === 'active' ? 'warning' : 'neutral';
  }

  public heartbeatText(device: Device): string {
    if (device.revokedAt) {
      return `Revoked ${this.formatDate(device.revokedAt)}`;
    }

    if (!device.lastSeenAt) {
      return 'No heartbeat received';
    }

    return `${device.online ? 'Online' : 'Offline'} since ${this.formatDate(device.lastSeenAt)}`;
  }

  public metadataJson(device: Device): string {
    return JSON.stringify(device.metadata, null, 2);
  }

  public eventAction(event: LedgerEventResponse): string {
    const action = event.payload['action'];
    return typeof action === 'string' ? action : event.type;
  }

  public trackEventById(_index: number, event: LedgerEventResponse): string {
    return event.id;
  }

  public trackHeartbeatById(_index: number, heartbeat: DeviceHeartbeatHistoryItem): string {
    return heartbeat.id;
  }

  private loadEvents(id: string): void {
    this.devicesService
      .getDeviceEvents(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.events = events.slice(-50).reverse();
          this.heartbeatHistory = this.toHeartbeatHistory(events);
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  private startStatusPolling(id: string): void {
    this.statusPollStop$.next();
    this.devicesService
      .observeDeviceStatus(id, 5_000)
      .pipe(skip(1), takeUntil(this.statusPollStop$), takeUntil(this.destroy$))
      .subscribe({
        next: (device) => {
          this.device = device;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private toHeartbeatHistory(events: LedgerEventResponse[]): DeviceHeartbeatHistoryItem[] {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    return events
      .filter((event) => this.eventAction(event) === 'DEVICE_HEARTBEAT')
      .map((event) => {
        const timestamp = this.eventTimestamp(event);
        return {
          id: event.id,
          timestamp,
          status: this.heartbeatStatus(event),
          metrics: this.heartbeatMetrics(event),
        };
      })
      .filter((heartbeat) => new Date(heartbeat.timestamp).getTime() >= cutoff)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }

  private eventTimestamp(event: LedgerEventResponse): string {
    return event.metadata.timestamp || event.createdAt;
  }

  private heartbeatStatus(event: LedgerEventResponse): string {
    const status = event.payload['heartbeatStatus'];
    return typeof status === 'string' && status.trim() ? status : 'online';
  }

  private heartbeatMetrics(event: LedgerEventResponse): string {
    const metrics = event.payload['metrics'];
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
      return 'No metrics reported';
    }

    const entries = Object.entries(metrics);
    if (entries.length === 0) {
      return 'No metrics reported';
    }

    return entries.map(([key, value]) => `${key}: ${String(value)}`).join(', ');
  }
}
