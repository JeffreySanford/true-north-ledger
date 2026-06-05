/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device, DeviceRegistrationResponse } from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';
import { DevicesComponent } from './devices.component';
import { DevicesModule } from './devices.module';

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

describe('DevicesComponent', () => {
  let fixture: ComponentFixture<DevicesComponent>;
  let listDevicesMock: ReturnType<typeof vi.fn>;
  let registerDeviceMock: ReturnType<typeof vi.fn>;
  let updateDeviceStatusMock: ReturnType<typeof vi.fn>;
  let revokeDeviceMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listDevicesMock = vi.fn(() => of({ devices: [buildDevice()], total: 1, page: 1, pageSize: 5 }));
    registerDeviceMock = vi.fn(() => of(buildRegistration({ id: '550e8400-e29b-41d4-a716-446655440001' })));
    updateDeviceStatusMock = vi.fn(() => of(buildDevice({ status: 'suspended', online: false })));
    revokeDeviceMock = vi.fn(() => of(buildDevice({ status: 'revoked', online: false, revokedAt: now })));

    await TestBed.configureTestingModule({
      imports: [DevicesModule],
      providers: [
        provideRouter([]),
        {
          provide: DevicesService,
          useValue: {
            listDevices: listDevicesMock,
            registerDevice: registerDeviceMock,
            updateDeviceStatus: updateDeviceStatusMock,
            revokeDevice: revokeDeviceMock,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DevicesComponent);
  });

  it('renders loaded device status and heartbeat text', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Receiving scanner');
    expect(root.textContent).toContain('scanner');
    expect(root.textContent).toContain('Online since');
    expect(root.textContent).toContain('active');
    expect(root.textContent).toContain('Showing 1-1 of 1 devices');
  });

  it('loads paginated device pages and resets to first page when filters apply', async () => {
    listDevicesMock
      .mockReturnValueOnce(of({ devices: [buildDevice()], total: 8, page: 1, pageSize: 5 }))
      .mockReturnValueOnce(of({ devices: [buildDevice({ name: 'Gateway page two' })], total: 8, page: 2, pageSize: 5 }))
      .mockReturnValueOnce(of({ devices: [buildDevice({ name: 'Filtered scanner' })], total: 1, page: 1, pageSize: 5 }));

    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.nextPage();
    await fixture.whenStable();
    expect(listDevicesMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 5 }));
    expect(fixture.componentInstance.page).toBe(2);
    expect(fixture.componentInstance.paginationSummary).toBe('Showing 6-8 of 8 devices');

    fixture.componentInstance.filtersForm.patchValue({ search: 'scanner' });
    fixture.componentInstance.applyFilters();
    await fixture.whenStable();

    expect(listDevicesMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'scanner', page: 1, pageSize: 5 }));
    expect(fixture.componentInstance.page).toBe(1);
  });

  it('adds registered devices emitted by the registration component', () => {
    fixture.componentInstance.handleRegistered(buildRegistration({ id: '550e8400-e29b-41d4-a716-446655440001' }));

    expect(fixture.componentInstance.error).toBeNull();
    expect(fixture.componentInstance.devices[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(fixture.componentInstance.totalDevices).toBe(1);
  });

  it('surfaces registration errors emitted by the registration component', () => {
    fixture.componentInstance.handleRegistrationError('Device name is already registered');

    expect(fixture.componentInstance.error).toBe('Device name is already registered');
  });

  it('updates and revokes device state from the registry controls', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const device = fixture.componentInstance.devices[0];
    fixture.componentInstance.updateStatus(device, 'suspended');
    fixture.componentInstance.revoke(device);

    expect(updateDeviceStatusMock).toHaveBeenCalledWith(device.id, {
      status: 'suspended',
      reason: 'Changed from registry page to suspended',
    });
    expect(revokeDeviceMock).toHaveBeenCalledWith(device.id);
  });

  it('surfaces status and revoke errors', async () => {
    updateDeviceStatusMock.mockReturnValueOnce(throwError(() => new Error('Status update failed')));
    revokeDeviceMock.mockReturnValueOnce(throwError(() => new Error('Revoke failed')));
    fixture.detectChanges();
    await fixture.whenStable();

    const device = fixture.componentInstance.devices[0];
    fixture.componentInstance.updateStatus(device, 'suspended');
    expect(fixture.componentInstance.error).toBe('Status update failed');

    fixture.componentInstance.revoke(device);
    expect(fixture.componentInstance.error).toBe('Revoke failed');
  });

  it('disables status and revoke controls for revoked devices', async () => {
    listDevicesMock.mockReturnValueOnce(of({
      devices: [buildDevice({ status: 'revoked', online: false, revokedAt: now })],
      total: 1,
      page: 1,
      pageSize: 5,
    }));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const actions = (fixture.nativeElement as HTMLElement).querySelector('.device-card__actions') as HTMLElement;
    const statusSelect = actions.querySelector('select') as HTMLSelectElement;
    const revokeButton = actions.querySelector('button') as HTMLButtonElement;

    expect(statusSelect.disabled).toBe(true);
    expect(revokeButton.disabled).toBe(true);
  });

  it('returns status tones and heartbeat copy for non-happy states', () => {
    const component = fixture.componentInstance;

    expect(component.statusTone(buildDevice({ status: 'suspended', online: false }))).toBe('error');
    expect(component.statusTone(buildDevice({ status: 'active', online: false }))).toBe('warning');
    expect(component.statusTone(buildDevice({ status: 'inactive', online: false }))).toBe('neutral');
    expect(component.heartbeatText(buildDevice({ lastSeenAt: null, online: false }))).toBe('No heartbeat received');
    expect(component.heartbeatText(buildDevice({ revokedAt: now, online: false }))).toContain('Revoked');
    expect(component.trackById(0, buildDevice())).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('renders the empty device state', async () => {
    listDevicesMock.mockReturnValueOnce(of({ devices: [], total: 0, page: 1, pageSize: 5 }));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const emptyState = root.querySelector('[data-testid="empty-state"]');

    expect(emptyState?.textContent).toContain('No devices registered');
    expect(emptyState?.textContent).toContain('Register the first scanner, tablet, gateway, or kiosk for this tenant.');
  });

  it('renders loading state with the shared connection status primitive', () => {
    listDevicesMock.mockReturnValueOnce(new Subject<never>().asObservable());

    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const loadingState = root.querySelector('[data-testid="device-loading-state"]');

    expect(loadingState?.textContent).toContain('Device registry');
    expect(loadingState?.textContent).toContain('Connecting');
    expect(loadingState?.textContent).toContain('Loading device registry');
  });

  it('renders error state with shared visual primitives', async () => {
    listDevicesMock.mockReturnValueOnce(throwError(() => new Error('Failed to fetch devices')));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const errorState = root.querySelector('[data-testid="device-error-state"]');
    const emptyState = errorState?.querySelector('[data-testid="empty-state"]');

    expect(errorState?.textContent).toContain('Device registry');
    expect(errorState?.textContent).toContain('Failed');
    expect(emptyState?.textContent).toContain('Device registry unavailable');
    expect(emptyState?.textContent).toContain('Failed to fetch devices');
  });
});
