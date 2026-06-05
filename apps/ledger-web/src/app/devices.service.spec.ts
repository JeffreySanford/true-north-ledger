import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { Device, DeviceRegistrationResponse, LedgerEventResponse } from '@true-north-ledger/shared-models';
import { DevicesService } from './devices.service';

const now = new Date('2026-06-04T12:00:00.000Z').toISOString();

function buildDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Dock scanner',
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

function buildRegistrationResponse(overrides: Partial<Device> = {}): DeviceRegistrationResponse {
  const device = buildDevice(overrides);
  return {
    ...device,
    apiKey: 'tnl_dev_test_key',
    provisioningPayload: {
      version: 1,
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      tenantId: device.tenantId,
      apiKey: 'tnl_dev_test_key',
      heartbeatPath: '/api/v1/devices/heartbeat',
      deviceEventPath: '/api/v1/device-events',
      batchDeviceEventPath: '/api/v1/device-events/batch',
      issuedAt: now,
    },
    provisioningUri: 'tnl-device://provision?payload=test',
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

function buildAdminLedgerEvent(): LedgerEventResponse {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'LEDGER_EVENT',
    actorType: 'user',
    actorId: 'admin',
    subjectType: 'device',
    subjectId: 'device-status',
    payload: { action: 'DEVICE_REVOKED', deviceId: '550e8400-e29b-41d4-a716-446655440000' },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-2',
      correlationId: 'correlation-2',
      userAgent: 'vitest',
      payloadHash: 'payload-hash-2',
      eventHash: 'event-hash-2',
      chainSequence: 2,
      result: 'accepted',
      timestamp: now,
    },
    createdAt: now,
  };
}

describe('DevicesService', () => {
  let service: DevicesService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('tnl.authToken', 'test-auth-token');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DevicesService],
    });

    service = TestBed.inject(DevicesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('tnl.authToken');
    http.verify();
  });

  it('lists devices with filters and validates response shape', () => {
    let devices: unknown;

    service.listDevices({ status: 'active', type: 'scanner', search: 'dock', page: 2, pageSize: 5 }).subscribe((response) => {
      devices = response;
    });

    const request = http.expectOne('/api/v1/devices?status=active&type=scanner&search=dock&page=2&pageSize=5');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-auth-token');
    request.flush({ devices: [buildDevice()], total: 6, page: 2, pageSize: 5 });

    expect(devices).toEqual({ devices: [buildDevice()], total: 6, page: 2, pageSize: 5 });
  });

  it('registers a device and returns the one-time API key', () => {
    let registered: unknown;

    service.registerDevice({ name: 'Dock scanner', type: 'scanner' }).subscribe((response) => {
      registered = response;
    });

    const request = http.expectOne('/api/v1/devices/register');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Dock scanner', type: 'scanner' });
    request.flush(buildRegistrationResponse());

    expect(registered).toMatchObject({
      apiKey: 'tnl_dev_test_key',
      name: 'Dock scanner',
      provisioningUri: 'tnl-device://provision?payload=test',
    });
  });

  it('updates device status through the API', () => {
    let updated: Device | undefined;

    service
      .updateDeviceStatus('550e8400-e29b-41d4-a716-446655440000', {
        status: 'suspended',
        reason: 'maintenance',
      })
      .subscribe((response) => {
        updated = response;
      });

    const request = http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'suspended', reason: 'maintenance' });
    request.flush(buildDevice({ status: 'suspended', online: false }));

    expect(updated?.status).toBe('suspended');
  });

  it('fetches device status through the API', () => {
    let device: Device | undefined;

    service.getDeviceStatus('550e8400-e29b-41d4-a716-446655440000').subscribe((response) => {
      device = response;
    });

    const request = http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status');
    expect(request.request.method).toBe('GET');
    request.flush(buildDevice({ status: 'active' }));

    expect(device?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('observes device status on a polling interval', async () => {
    vi.useFakeTimers();
    const statuses: Device[] = [];
    const subscription = service
      .observeDeviceStatus('550e8400-e29b-41d4-a716-446655440000', 1_000)
      .subscribe((device) => statuses.push(device));

    try {
      await vi.advanceTimersByTimeAsync(0);
      const first = http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status');
      expect(first.request.method).toBe('GET');
      first.flush(buildDevice({ online: true, status: 'active' }));

      await vi.advanceTimersByTimeAsync(1_000);
      const second = http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status');
      second.flush(buildDevice({ online: false, status: 'suspended' }));

      expect(statuses.map((device) => device.online)).toEqual([true, false]);
      expect(statuses.at(-1)?.status).toBe('suspended');
    } finally {
      subscription.unsubscribe();
      vi.useRealTimers();
    }
  });


  it('filters ledger events for a device detail stream', () => {
    let events: LedgerEventResponse[] = [];

    service.getDeviceEvents('550e8400-e29b-41d4-a716-446655440000').subscribe((response) => {
      events = response;
    });

    const request = http.expectOne('/api/v1/ledger/events');
    expect(request.request.method).toBe('GET');
    request.flush([
      buildLedgerEvent({ payload: { action: 'DEVICE_HEARTBEAT' } }),
      buildLedgerEvent({
        id: '22222222-2222-4222-8222-222222222222',
        subjectId: 'other-device',
        deviceId: 'other-device',
        payload: { action: 'DEVICE_HEARTBEAT' },
      }),
      buildAdminLedgerEvent(),
    ]);

    expect(events.map((event) => event.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('rejects invalid list API response bodies', () => {
    let receivedError: unknown;

    service.listDevices().subscribe({
      error: (error) => {
        receivedError = error;
      },
    });

    const request = http.expectOne('/api/v1/devices');
    request.flush({ invalid: true });

    expect(receivedError).toBeInstanceOf(Error);
  });

  it('rejects invalid registration, status, fetch status, and revoke response bodies', () => {
    const errors: unknown[] = [];

    service.registerDevice({ name: 'Dock scanner', type: 'scanner' }).subscribe({ error: (error) => errors.push(error) });
    http.expectOne('/api/v1/devices/register').flush({ invalid: true });

    service.updateDeviceStatus('550e8400-e29b-41d4-a716-446655440000', { status: 'active' }).subscribe({
      error: (error) => errors.push(error),
    });
    http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status').flush({ invalid: true });

    service.getDeviceStatus('550e8400-e29b-41d4-a716-446655440000').subscribe({ error: (error) => errors.push(error) });
    http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000/status').flush({ invalid: true });

    service.revokeDevice('550e8400-e29b-41d4-a716-446655440000').subscribe({ error: (error) => errors.push(error) });
    http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000').flush({ invalid: true });

    expect(errors).toHaveLength(4);
    expect(errors.every((error) => error instanceof Error)).toBe(true);
  });

  it('uses API error messages before fallback HTTP status text', () => {
    let apiMessage: string | undefined;
    let fallbackMessage: string | undefined;

    service.registerDevice({ name: 'Duplicate', type: 'scanner' }).subscribe({
      error: (error: Error) => {
        apiMessage = error.message;
      },
    });
    http.expectOne('/api/v1/devices/register').flush(
      { message: 'Device name is already registered' },
      { status: 400, statusText: 'Bad Request' },
    );

    service.revokeDevice('550e8400-e29b-41d4-a716-446655440000').subscribe({
      error: (error: Error) => {
        fallbackMessage = error.message;
      },
    });
    http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000').flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });

    expect(apiMessage).toBe('Device name is already registered');
    expect(fallbackMessage).toBe('Failed to revoke device: 503 Service Unavailable');
  });

  it('revokes a device through the API', () => {
    let revoked: Device | undefined;

    service.revokeDevice('550e8400-e29b-41d4-a716-446655440000').subscribe((response) => {
      revoked = response;
    });

    const request = http.expectOne('/api/v1/devices/550e8400-e29b-41d4-a716-446655440000');
    expect(request.request.method).toBe('DELETE');
    request.flush(buildDevice({ status: 'revoked', online: false, revokedAt: now }));

    expect(revoked?.status).toBe('revoked');
  });
});
