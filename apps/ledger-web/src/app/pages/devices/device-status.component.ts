import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { Device, DeviceStatus, LedgerEventResponse } from '@true-north-ledger/shared-models';

interface DeviceStatusAuditItem {
  id: string;
  action: string;
  status: string;
  result: string;
  timestamp: string;
}

@Component({
  standalone: false,
  selector: 'tnl-device-status',
  templateUrl: './device-status.component.html',
  styleUrls: ['./device-status.component.scss'],
})
export class DeviceStatusComponent {
  @Input({ required: true }) device!: Device;
  @Input() events: LedgerEventResponse[] = [];
  @Output() readonly statusChange = new EventEmitter<DeviceStatus>();
  @Output() readonly revokeDevice = new EventEmitter<void>();

  public readonly statuses: DeviceStatus[] = ['active', 'inactive', 'suspended', 'revoked'];

  public requestStatusChange(status: DeviceStatus): void {
    if (!this.device || this.device.status === 'revoked' || status === this.device.status) {
      return;
    }

    if (typeof window !== 'undefined' && !window.confirm(this.statusConfirmationMessage(status))) {
      return;
    }

    this.statusChange.emit(status);
  }

  public requestRevocation(): void {
    if (!this.device || this.device.status === 'revoked') {
      return;
    }

    this.revokeDevice.emit();
  }

  public statusAuditTrail(): DeviceStatusAuditItem[] {
    return this.events
      .filter((event) =>
        ['DEVICE_STATUS_CHANGED', 'DEVICE_REVOKED', 'DEVICE_AUTO_SUSPENDED'].includes(this.eventAction(event)),
      )
      .slice(0, 5)
      .map((event) => ({
        id: event.id,
        action: this.eventAction(event),
        status: this.eventStatus(event),
        result: event.metadata.result,
        timestamp: event.metadata.timestamp || event.createdAt,
      }));
  }

  public trackAuditById(_index: number, item: DeviceStatusAuditItem): string {
    return item.id;
  }

  private statusConfirmationMessage(status: DeviceStatus): string {
    if (status === 'suspended' || status === 'revoked') {
      return `Change ${this.device.name} to ${status}? Device-key access will be blocked.`;
    }

    return `Change ${this.device.name} to ${status}?`;
  }

  private eventAction(event: LedgerEventResponse): string {
    const action = event.payload['action'];
    return typeof action === 'string' ? action : event.type;
  }

  private eventStatus(event: LedgerEventResponse): string {
    const status = event.payload['status'] ?? event.payload['deviceStatus'];
    return typeof status === 'string' ? status : 'status not recorded';
  }
}
