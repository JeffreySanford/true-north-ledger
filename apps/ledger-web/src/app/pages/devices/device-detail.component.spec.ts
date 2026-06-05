/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device, LedgerEventResponse } from '@true-north-ledger/shared-models';
import { DevicesService } from '../../devices.service';
import { DeviceDetailComponent } from './device-detail.component';
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
    metadata: { zone: 'dock' },
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

function buildLedgerEvent(overrides: Partial<LedgerEventResponse> = {}): LedgerEventResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'DEVICE_LEDGER_EVENT',
    actorType: 'device',
    actorId: '550e8400-e29b-41d4-a716-446655440000',
    subjectType: 'device',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    deviceId: '550e8400-e29b-41d4-a716-446655440000',
    deviceType: 'scanner',
    payload: { action: 'DEVICE_HEARTBEAT' },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      userAgent: 'vitest',
      payloadHash: 'payload-hash',
      eventHash: 'event-hash',
      chainSequence: 1,
      result: 'accepted',
      timestamp: now,
    },
    createdAt: now,
    ...overrides,
  };
}

describe('DeviceDetailComponent', () => {
  let fixture: ComponentFixture<DeviceDetailComponent>;
  let getDeviceStatusMock: ReturnType<typeof vi.fn>;
  let getDeviceEventsMock: ReturnType<typeof vi.fn>;
  let observeDeviceStatusMock: ReturnType<typeof vi.fn>;
  let updateDeviceStatusMock: ReturnType<typeof vi.fn>;
  let revokeDeviceMock: ReturnType<typeof vi.fn>;
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T12:30:00.000Z'));

    getDeviceStatusMock = vi.fn(() => of(buildDevice()));
    getDeviceEventsMock = vi.fn(() =>
      of([
        buildLedgerEvent({
          id: '11111111-1111-4111-8111-111111111111',
          payload: { action: 'DEVICE_HEARTBEAT', heartbeatStatus: 'online', metrics: { battery: 92 } },
          metadata: {
            ...buildLedgerEvent().metadata,
            timestamp: '2026-06-04T12:00:00.000Z',
            chainSequence: 1,
          },
          createdAt: '2026-06-04T12:00:00.000Z',
        }),
        buildLedgerEvent({
          id: '22222222-2222-4222-8222-222222222222',
          payload: { action: 'DEVICE_HEARTBEAT', heartbeatStatus: 'degraded', metrics: { battery: 48 } },
          metadata: {
            ...buildLedgerEvent().metadata,
            timestamp: '2026-06-04T08:00:00.000Z',
            chainSequence: 2,
          },
          createdAt: '2026-06-04T08:00:00.000Z',
        }),
        buildLedgerEvent({
          id: '33333333-3333-4333-8333-333333333333',
          payload: { action: 'DEVICE_HEARTBEAT', heartbeatStatus: 'online', metrics: { battery: 99 } },
          metadata: {
            ...buildLedgerEvent().metadata,
            timestamp: '2026-06-02T12:00:00.000Z',
            chainSequence: 3,
          },
          createdAt: '2026-06-02T12:00:00.000Z',
        }),
      ]),
    );
    observeDeviceStatusMock = vi.fn(() => of(buildDevice()));
    updateDeviceStatusMock = vi.fn(() => of(buildDevice({ status: 'suspended', online: false, lastSeenAt: null })));
    revokeDeviceMock = vi.fn(() => of(buildDevice({ status: 'revoked', online: false, revokedAt: now })));
    navigateMock = vi.fn(() => Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [DevicesModule],
      providers: [
        {
          provide: DevicesService,
          useValue: {
            getDeviceStatus: getDeviceStatusMock,
            getDeviceEvents: getDeviceEventsMock,
            observeDeviceStatus: observeDeviceStatusMock,
            updateDeviceStatus: updateDeviceStatusMock,
            revokeDevice: revokeDeviceMock,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '550e8400-e29b-41d4-a716-446655440000' }) } },
        },
        { provide: Router, useValue: { navigate: navigateMock } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceDetailComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders device detail, metadata, permissions, and audit events', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Receiving scanner');
    expect(root.textContent).toContain('Online since');
    expect(root.textContent).toContain('Heartbeat failures');
    expect(root.textContent).toContain('device.heartbeat.write');
    expect(root.textContent).toContain('"zone": "dock"');
    expect(root.textContent).toContain('DEVICE_HEARTBEAT');
    expect(root.textContent).toContain('Heartbeat History');
    expect(root.textContent).toContain('battery: 92');
    expect(root.textContent).toContain('degraded');
    expect(fixture.componentInstance.heartbeatHistory).toHaveLength(2);
    expect(getDeviceStatusMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(getDeviceEventsMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(observeDeviceStatusMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 5000);
  });

  it('renders device ingestion events in the audit stream', async () => {
    getDeviceEventsMock.mockReturnValueOnce(
      of([
        buildLedgerEvent({
          id: '44444444-4444-4444-8444-444444444444',
          payload: {
            action: 'DEVICE_EVENT_RECEIVED',
            eventType: 'inventory.scan',
            quantity: 4,
          },
          metadata: {
            ...buildLedgerEvent().metadata,
            chainSequence: 4,
          },
        }),
      ]),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="device-event-stream"]')?.textContent).toContain('DEVICE_EVENT_RECEIVED');
    expect(fixture.componentInstance.events).toHaveLength(1);
    expect(fixture.componentInstance.eventAction(fixture.componentInstance.events[0])).toBe('DEVICE_EVENT_RECEIVED');
  });

  it('updates device state from the live status observable', async () => {
    const statusUpdates = new Subject<Device>();
    observeDeviceStatusMock.mockReturnValueOnce(statusUpdates.asObservable());

    fixture.detectChanges();
    await fixture.whenStable();

    statusUpdates.next(buildDevice({ status: 'active', online: true }));
    statusUpdates.next(buildDevice({ status: 'suspended', online: false, lastSeenAt: null }));
    fixture.detectChanges();

    expect(fixture.componentInstance.device?.status).toBe('suspended');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No heartbeat received');
  });

  it('renders auto-suspension details when heartbeat failures reach threshold', async () => {
    getDeviceStatusMock.mockReturnValueOnce(
      of(
        buildDevice({
          status: 'suspended',
          online: false,
          heartbeatFailureCount: 3,
          autoSuspendedAt: '2026-06-04T12:20:00.000Z',
        }),
      ),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Heartbeat failures');
    expect(root.textContent).toContain('3');
    expect(root.textContent).toContain('Auto-suspended');
    expect(root.textContent).toContain('2026-06-04T12:20:00.000Z');
  });

  it('updates status and refreshes device events', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.updateStatus('suspended');
    await fixture.whenStable();

    expect(updateDeviceStatusMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', {
      status: 'suspended',
      reason: 'Changed from detail page to suspended',
    });
    expect(fixture.componentInstance.device?.status).toBe('suspended');
    expect(getDeviceEventsMock).toHaveBeenCalledTimes(2);
  });

  it('confirms before revoking and disables revoked controls', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.revoke();
    await fixture.whenStable();
    fixture.detectChanges();

    const actions = (fixture.nativeElement as HTMLElement).querySelector('.detail-actions') as HTMLElement;
    const statusSelect = actions.querySelector('select') as HTMLSelectElement;
    const revokeButton = actions.querySelector('button') as HTMLButtonElement;

    expect(confirmSpy).toHaveBeenCalledWith('Revoke Receiving scanner?');
    expect(revokeDeviceMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(statusSelect.disabled).toBe(true);
    expect(revokeButton.disabled).toBe(true);
  });

  it('does not revoke when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.revoke();

    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });

  it('surfaces detail load and status errors', async () => {
    getDeviceStatusMock.mockReturnValueOnce(throwError(() => new Error('Device not found')));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.error).toBe('Device not found');

    fixture.componentInstance.device = buildDevice();
    updateDeviceStatusMock.mockReturnValueOnce(throwError(() => new Error('Status failed')));
    fixture.componentInstance.updateStatus('inactive');

    expect(fixture.componentInstance.error).toBe('Status failed');
  });

  it('navigates back to the registry', () => {
    fixture.componentInstance.backToRegistry();

    expect(navigateMock).toHaveBeenCalledWith(['/devices']);
  });
});
