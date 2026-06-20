/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device, DeviceRegistrationResponse } from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';
import { DeviceRegistrationComponent } from './device-registration.component';

const now = new Date('2026-06-04T12:00:00.000Z').toISOString();

function buildDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Receiving scanner',
    type: 'scanner',
    tenantId: '00000000-0000-0000-0000-000000000000',
    status: 'active',
    permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    metadata: {},
    lastSeenAt: now,
    online: true,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    heartbeatFailureCount: 0,
    autoSuspendedAt: null,
    ...overrides,
  };
}

function buildRegistration(overrides: Partial<Device> = {}): DeviceRegistrationResponse {
  const device = buildDevice(overrides);
  return {
    ...device,
    apiKey: 'tnl_dev_key',
    provisioningPayload: {
      version: 1,
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      tenantId: device.tenantId,
      apiKey: 'tnl_dev_key',
      heartbeatPath: '/api/v1/devices/heartbeat',
      deviceEventPath: '/api/v1/device-events',
      batchDeviceEventPath: '/api/v1/device-events/batch',
      issuedAt: now,
    },
    provisioningUri: 'tnl-device://provision?payload=test',
  };
}

describe('DeviceRegistrationComponent', () => {
  let fixture: ComponentFixture<DeviceRegistrationComponent>;
  let registerDeviceMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    registerDeviceMock = vi.fn(() => of(buildRegistration()));

    await TestBed.configureTestingModule({
      declarations: [DeviceRegistrationComponent],
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: DevicesService,
          useValue: {
            registerDevice: registerDeviceMock,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceRegistrationComponent);
  });

  it('submits registration and displays the one-time API key and QR code', async () => {
    const emitSpy = vi.spyOn(fixture.componentInstance.registered, 'emit');
    fixture.componentInstance.registrationForm.patchValue({
      name: 'Gateway 01',
      type: 'gateway',
      metadataJson: '{"zone":"dock"}',
    });

    fixture.componentInstance.register();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(registerDeviceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Gateway 01',
        type: 'gateway',
        metadata: { zone: 'dock' },
      }),
    );
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'tnl_dev_key' }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('tnl_dev_key');
    expect(root.textContent).toContain('server persists only its hash');
    expect(root.textContent).toContain('Scan the QR code');
    expect(root.querySelector('img[alt="QR code for Receiving scanner provisioning"]')).not.toBeNull();
  });

  it('blocks registration when metadata JSON is invalid', () => {
    const errorSpy = vi.spyOn(fixture.componentInstance.registrationError, 'emit');
    fixture.componentInstance.registrationForm.patchValue({
      name: 'Bad metadata',
      metadataJson: '{bad-json',
    });

    fixture.componentInstance.register();

    expect(registerDeviceMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Expected property name'));
  });

  it('marks the registration form touched when required fields are missing', () => {
    fixture.componentInstance.registrationForm.patchValue({ name: '' });

    fixture.componentInstance.register();

    expect(registerDeviceMock).not.toHaveBeenCalled();
    expect(fixture.componentInstance.registrationForm.controls.name.touched).toBe(true);
  });

  it('rejects metadata that is not a JSON object', () => {
    const errorSpy = vi.spyOn(fixture.componentInstance.registrationError, 'emit');
    fixture.componentInstance.registrationForm.patchValue({
      name: 'Array metadata',
      metadataJson: '[]',
    });

    fixture.componentInstance.register();

    expect(registerDeviceMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Metadata must be a JSON object');
  });

  it('surfaces registration API errors and clears saving state', () => {
    const errorSpy = vi.spyOn(fixture.componentInstance.registrationError, 'emit');
    registerDeviceMock.mockReturnValueOnce(throwError(() => new Error('Device name is already registered')));
    fixture.componentInstance.registrationForm.patchValue({
      name: 'Duplicate',
      metadataJson: '{}',
    });

    fixture.componentInstance.register();

    expect(errorSpy).toHaveBeenCalledWith('Device name is already registered');
    expect(fixture.componentInstance.saving).toBe(false);
  });

  it('shows QR pending while provisioning QR generation is still running', async () => {
    fixture.componentInstance.registration = buildRegistration();
    fixture.componentInstance.qrCodeDataUrl = null;
    fixture.componentInstance.qrCodeError = null;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('QR pending');
    expect(root.querySelector('img[alt="QR code for Receiving scanner provisioning"]')).toBeNull();
  });

  it('renders compact provisioning sections with stable selectors for narrow layouts', () => {
    fixture.componentInstance.registration = buildRegistration();
    fixture.componentInstance.qrCodeDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E';
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const panel = root.querySelector('[data-testid="device-provisioning-panel"]') as HTMLElement;
    const details = root.querySelector('[data-testid="device-provisioning-details"]') as HTMLElement;
    const actions = root.querySelector('[data-testid="device-provisioning-actions"]') as HTMLElement;
    const qr = root.querySelector('[data-testid="device-provisioning-qr"]') as HTMLElement;

    expect(panel).not.toBeNull();
    expect(details.textContent).toContain('tnl_dev_key');
    expect(actions.querySelectorAll('button')).toHaveLength(2);
    expect(qr.textContent).toContain('One-time provisioning QR');
    expect(qr.querySelector('img')?.getAttribute('alt')).toBe('QR code for Receiving scanner provisioning');
  });

  it('shows QR generation errors without hiding the one-time API key', async () => {
    fixture.componentInstance.registration = buildRegistration();
    fixture.componentInstance.qrCodeDataUrl = null;
    fixture.componentInstance.qrCodeError = 'QR renderer unavailable';
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('tnl_dev_key');
    expect(root.textContent).toContain('QR pending');
    expect(root.textContent).toContain('QR error: QR renderer unavailable');
  });

  it('copies one-time key material when clipboard is available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    fixture.componentInstance.registration = buildRegistration();

    await fixture.componentInstance.copyApiKey();
    await fixture.componentInstance.copyProvisioningUri();

    expect(writeText).toHaveBeenNthCalledWith(1, 'tnl_dev_key');
    expect(writeText).toHaveBeenNthCalledWith(2, 'tnl-device://provision?payload=test');
    expect(fixture.componentInstance.copied).toBe(true);
  });
});
