import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  Device,
  DeviceRegistrationResponse,
  DeviceStatus,
  DeviceType,
} from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';
import type { ConnectionStatusState } from '../../shared/connection-status/connection-status.component';
import type { StatusChipTone } from '../../shared/status-chip/status-chip.component';

@Component({
  standalone: false,
  selector: 'tnl-devices',
  templateUrl: './devices.component.html',
  styleUrls: ['./devices.component.scss'],
})
export class DevicesComponent implements OnInit, OnDestroy {
  public readonly deviceTypes: DeviceType[] = ['scanner', 'printer', 'sensor', 'kiosk', 'gateway', 'tablet'];
  public readonly deviceStatuses: DeviceStatus[] = ['active', 'inactive', 'suspended', 'revoked'];

  public devices: Device[] = [];
  public totalDevices = 0;
  public page = 1;
  public readonly pageSize = 5;
  public loading = false;
  public error: string | null = null;

  private readonly devicesService = inject(DevicesService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  public readonly filtersForm = this.formBuilder.nonNullable.group({
    status: ['' as DeviceStatus | ''],
    type: ['' as DeviceType | ''],
    search: [''],
  });

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public refresh(): void {
    this.loadDevices(this.page);
  }

  public applyFilters(): void {
    this.loadDevices(1);
  }

  public previousPage(): void {
    if (this.page > 1) {
      this.loadDevices(this.page - 1);
    }
  }

  public nextPage(): void {
    if (this.page < this.totalPages) {
      this.loadDevices(this.page + 1);
    }
  }

  public get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalDevices / this.pageSize));
  }

  public get paginationSummary(): string {
    if (this.totalDevices === 0) {
      return 'Showing 0 devices';
    }

    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.totalDevices);
    return `Showing ${start}-${end} of ${this.totalDevices} devices`;
  }

  private loadDevices(page: number): void {
    this.loading = true;
    this.error = null;

    this.devicesService
      .listDevices({ ...this.filtersForm.getRawValue(), page, pageSize: this.pageSize })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.devices = response.devices;
          this.totalDevices = response.total;
          this.page = response.page ?? page;
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

  public handleRegistered(registered: DeviceRegistrationResponse): void {
    this.error = null;
    this.devices = [registered, ...this.devices.filter((device) => device.id !== registered.id)];
    this.totalDevices += 1;
    this.changeDetectorRef.detectChanges();
  }

  public handleRegistrationError(message: string): void {
    this.error = message;
    this.changeDetectorRef.detectChanges();
  }

  public updateStatus(device: Device, status: DeviceStatus): void {
    this.devicesService
      .updateDeviceStatus(device.id, { status, reason: `Changed from registry page to ${status}` })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.devices = this.devices.map((item) => (item.id === updated.id ? updated : item));
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public revoke(device: Device): void {
    this.devicesService
      .revokeDevice(device.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.devices = this.devices.map((item) => (item.id === updated.id ? updated : item));
          this.changeDetectorRef.detectChanges();
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

  public deviceStateText(device: Device): string {
    if (device.status === 'revoked') {
      return 'Access revoked';
    }

    if (device.status === 'suspended') {
      return 'Access blocked';
    }

    if (device.status === 'inactive') {
      return 'Inactive';
    }

    return device.online ? 'Online' : 'Heartbeat missing';
  }

  public heartbeatConnectionState(device: Device): ConnectionStatusState {
    if (device.online) {
      return 'connected';
    }

    if (!device.lastSeenAt || (device.heartbeatFailureCount ?? 0) > 0) {
      return 'failed';
    }

    return 'disconnected';
  }

  public heartbeatDetail(device: Device): string {
    const failureCount = device.heartbeatFailureCount ?? 0;

    if (failureCount > 0) {
      return `${this.heartbeatText(device)}. ${failureCount} heartbeat failures`;
    }

    return this.heartbeatText(device);
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

  public countByStatus(status: DeviceStatus): number {
    return this.devices.filter((device) => device.status === status).length;
  }

  public trackById(_index: number, device: Device): string {
    return device.id;
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

}
