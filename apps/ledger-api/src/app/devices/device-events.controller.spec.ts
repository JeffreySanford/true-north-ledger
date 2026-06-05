import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { DeviceEventsController } from './device-events.controller';
import type { DeviceActor, DevicesService } from './devices.service';

const actor: DeviceActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  actorType: 'device',
  tenantId: '00000000-0000-0000-0000-000000000000',
  permissions: ['device.events.write'],
  deviceId: '11111111-1111-4111-8111-111111111111',
  deviceType: 'scanner',
};

const request = {
  user: actor,
  tenantId: actor.tenantId,
  deviceId: actor.deviceId,
  ip: '127.0.0.1',
  headers: {
    'user-agent': 'jest',
    'x-correlation-id': 'corr-1',
  },
};

describe('DeviceEventsController', () => {
  let service: {
    ingestDeviceEvent: jest.Mock;
    ingestDeviceEventsBatch: jest.Mock;
  };
  let controller: DeviceEventsController;

  beforeEach(() => {
    service = {
      ingestDeviceEvent: jest.fn().mockReturnValue(of({
        eventId: '22222222-2222-4222-8222-222222222222',
        serverTimestamp: '2026-06-04T12:00:00.000Z',
      })),
      ingestDeviceEventsBatch: jest.fn().mockReturnValue(of({ results: [] })),
    };
    controller = new DeviceEventsController(service as unknown as DevicesService);
  });

  it('delegates valid single device events with request context', () => {
    controller.ingest({ eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-1' } }, request);

    expect(service.ingestDeviceEvent).toHaveBeenCalledWith(
      actor,
      { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-1' } },
      {
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
        correlationId: 'corr-1',
      },
    );
  });

  it('rejects oversized single device event payloads', () => {
    expect(() =>
      controller.ingest(
        {
          eventType: 'SCAN_RECEIVED',
          payload: { blob: 'x'.repeat(17 * 1024) },
        },
        request,
      ),
    ).toThrow(BadRequestException);
    expect(service.ingestDeviceEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized aggregate batch device event payloads', () => {
    expect(() =>
      controller.ingestBatch(
        {
          events: Array.from({ length: 5 }, (_, index) => ({
            eventType: `BATCH_${index}`,
            payload: { blob: 'x'.repeat(14 * 1024) },
          })),
        },
        request,
      ),
    ).toThrow(BadRequestException);
    expect(service.ingestDeviceEventsBatch).not.toHaveBeenCalled();
  });
});
