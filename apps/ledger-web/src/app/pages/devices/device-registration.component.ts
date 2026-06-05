import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, Output, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import * as QRCode from 'qrcode';
import {
  DevicePermission,
  DeviceRegistrationResponse,
  DeviceType,
} from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';

interface PermissionOption {
  controlName: 'heartbeat' | 'events' | 'statusRead';
  permission: DevicePermission;
}

@Component({
  standalone: false,
  selector: 'tnl-device-registration',
  templateUrl: './device-registration.component.html',
  styleUrls: ['./device-registration.component.scss'],
})
export class DeviceRegistrationComponent implements OnDestroy {
  @Output() readonly registered = new EventEmitter<DeviceRegistrationResponse>();
  @Output() readonly registrationError = new EventEmitter<string>();

  public readonly deviceTypes: DeviceType[] = ['scanner', 'printer', 'sensor', 'kiosk', 'gateway', 'tablet'];
  public readonly availablePermissions: PermissionOption[] = [
    { controlName: 'heartbeat', permission: 'device.heartbeat.write' },
    { controlName: 'events', permission: 'device.events.write' },
    { controlName: 'statusRead', permission: 'device.status.read' },
  ];

  public saving = false;
  public registration: DeviceRegistrationResponse | null = null;
  public qrCodeDataUrl: string | null = null;
  public qrCodeError: string | null = null;
  public copied = false;

  private readonly devicesService = inject(DevicesService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  public readonly registrationForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    type: ['scanner' as DeviceType, Validators.required],
    permissions: this.formBuilder.nonNullable.group({
      heartbeat: [true],
      events: [true],
      statusRead: [true],
    }),
    metadataJson: ['{}', Validators.required],
  });

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public register(): void {
    if (this.registrationForm.invalid) {
      this.registrationForm.markAllAsTouched();
      return;
    }

    const metadata = this.parseMetadata();
    if (!metadata) {
      return;
    }

    const value = this.registrationForm.getRawValue();
    this.saving = true;
    this.registration = null;
    this.qrCodeDataUrl = null;
    this.qrCodeError = null;
    this.copied = false;

    this.devicesService
      .registerDevice({
        name: value.name,
        type: value.type,
        permissions: this.selectedPermissions(),
        metadata,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (registered) => {
          this.registration = registered;
          this.registered.emit(registered);
          this.saving = false;
          this.registrationForm.patchValue({ name: '', metadataJson: '{}' });
          void this.generateProvisioningQr(registered.provisioningUri);
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.registrationError.emit(error instanceof Error ? error.message : String(error));
          this.saving = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public async copyApiKey(): Promise<void> {
    if (!this.registration?.apiKey || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(this.registration.apiKey);
    this.copied = true;
  }

  public async copyProvisioningUri(): Promise<void> {
    if (!this.registration?.provisioningUri || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(this.registration.provisioningUri);
    this.copied = true;
  }

  private selectedPermissions(): DevicePermission[] {
    const values = this.registrationForm.controls.permissions.getRawValue();
    return this.availablePermissions
      .filter((option) => values[option.controlName])
      .map((option) => option.permission);
  }

  private parseMetadata(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(this.registrationForm.controls.metadataJson.value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Metadata must be a JSON object');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      this.registrationError.emit(error instanceof Error ? error.message : 'Metadata must be valid JSON');
      return null;
    }
  }

  private async generateProvisioningQr(provisioningUri: string): Promise<void> {
    try {
      const svg = await QRCode.toString(provisioningUri, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 180,
      });
      this.qrCodeDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      this.qrCodeError = null;
    } catch (error) {
      this.qrCodeDataUrl = null;
      this.qrCodeError = error instanceof Error ? error.message : 'QR code generation failed';
    } finally {
      this.changeDetectorRef.detectChanges();
    }
  }
}
