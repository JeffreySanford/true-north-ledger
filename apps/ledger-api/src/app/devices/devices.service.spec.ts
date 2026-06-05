import { of } from 'rxjs';
import { DevicesService } from './devices.service';
import { DeviceEntity } from './device.entity';
import type { LedgerEventsService } from '../ledger-events/ledger-events.service';

const tenantId = '00000000-0000-0000-0000-000000000000';
const now = new Date('2026-06-04T12:00:00.000Z');

function buildDevice(overrides: Partial<DeviceEntity> = {}): DeviceEntity {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Dock scanner',
    type: 'scanner',
    tenantId,
    apiKeyHash: 'a'.repeat(64),
    publicKey: null,
    status: 'active',
    lastSeenAt: null,
    heartbeatFailureCount: 0,
    autoSuspendedAt: null,
    permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    metadata: {},
    provisioningPayloadVersion: 1,
    lastProvisionedAt: now,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    ...overrides,
  } as DeviceEntity;
}

describe('DevicesService', () => {
  let savedDevices: DeviceEntity[];
  let service: DevicesService;
  let repository: {
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let nonceRepository: {
    delete: jest.Mock;
    save: jest.Mock;
  };
  let ledgerEventsService: Pick<LedgerEventsService, 'appendEvent'>;

  beforeEach(() => {
    savedDevices = [];
    repository = {
      save: jest.fn(async (entity: DeviceEntity) => {
        const saved = buildDevice({
          ...entity,
          createdAt: entity.createdAt ?? now,
          updatedAt: now,
        });
        savedDevices.push(saved);
        return saved;
      }),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
          callback({ getRepository: () => nonceRepository }),
        ),
      },
    };
    nonceRepository = {
      delete: jest.fn(async () => ({ affected: 0 })),
      save: jest.fn(async (entity: unknown) => entity),
    };
    ledgerEventsService = {
      appendEvent: jest.fn(() =>
        of({
          id: '7f6e0f65-8855-4e4a-8e0c-a88d076f3d8f',
          metadata: { timestamp: now.toISOString() },
        }),
      ),
    } as unknown as Pick<LedgerEventsService, 'appendEvent'>;

    service = new DevicesService(repository as never, nonceRepository as never, ledgerEventsService as LedgerEventsService);
  });

  it('lists devices with filters and pagination metadata', (done) => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[buildDevice({ name: 'Dock scanner page two' })], 6]),
    };
    repository.createQueryBuilder.mockReturnValueOnce(queryBuilder);

    service
      .listDevices(tenantId, {
        status: 'active',
        type: 'scanner',
        search: 'dock',
        page: 2,
        pageSize: 5,
      })
      .subscribe({
        next: (response) => {
          expect(response).toMatchObject({
            total: 6,
            page: 2,
            pageSize: 5,
            devices: [expect.objectContaining({ name: 'Dock scanner page two' })],
          });
          expect(queryBuilder.where).toHaveBeenCalledWith('device.tenant_id = :tenantId', { tenantId });
          expect(queryBuilder.andWhere).toHaveBeenCalledWith('device.status = :status', { status: 'active' });
          expect(queryBuilder.andWhere).toHaveBeenCalledWith('device.device_type = :type', { type: 'scanner' });
          expect(queryBuilder.andWhere).toHaveBeenCalledWith('LOWER(device.device_name) LIKE :search', {
            search: '%dock%',
          });
          expect(queryBuilder.skip).toHaveBeenCalledWith(5);
          expect(queryBuilder.take).toHaveBeenCalledWith(5);
          done();
        },
        error: done,
      });
  });

  it('registers a device, returns the raw API key once, and persists only the key hash', (done) => {
    service
      .registerDevice(
        {
          name: 'Dock scanner',
          type: 'scanner',
          metadata: { zone: 'receiving' },
        },
        { userId: 'admin', actorType: 'user', tenantId },
      )
      .subscribe({
        next: (registered) => {
          expect(registered.apiKey).toMatch(/^tnl_dev_/);
          expect(registered.provisioningUri).toContain('tnl-device://provision?payload=');
          expect(registered.provisioningPayload).toMatchObject({
            version: 1,
            deviceId: registered.id,
            deviceName: 'Dock scanner',
            deviceType: 'scanner',
            tenantId,
            apiKey: registered.apiKey,
            heartbeatPath: '/api/v1/devices/heartbeat',
            deviceEventPath: '/api/v1/device-events',
            batchDeviceEventPath: '/api/v1/device-events/batch',
          });
          expect(registered.name).toBe('Dock scanner');
          expect(savedDevices[0].apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
          expect(savedDevices[0].apiKeyHash).not.toBe(registered.apiKey);
          expect(savedDevices[0].provisioningPayloadVersion).toBe(1);
          expect(savedDevices[0].lastProvisionedAt).toBeInstanceOf(Date);
          expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'DEVICE_LEDGER_EVENT',
              deviceId: registered.id,
              payload: expect.objectContaining({ action: 'DEVICE_REGISTERED' }),
            }),
            expect.objectContaining({ userId: 'admin' }),
            tenantId,
            {},
          );
          done();
        },
        error: done,
      });
  });

  it('validates a device API key into device actor context', async () => {
    const hash = service['hashToken']('raw-device-key');
    repository.findOne.mockResolvedValueOnce(buildDevice({ apiKeyHash: hash }));

    const actor = await service.validateDeviceKey('raw-device-key');

    expect(actor).toMatchObject({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: 'device',
      tenantId,
      deviceType: 'scanner',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
    });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { apiKeyHash: hash } });
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: 'DEVICE_AUTH_SUCCESS' }),
      }),
      expect.objectContaining({ actorType: 'device' }),
      tenantId,
      {},
    );
  });

  it('rejects revoked device API keys', async () => {
    repository.findOne.mockResolvedValueOnce(buildDevice({ status: 'revoked' }));

    await expect(service.validateDeviceKey('revoked-device-key')).rejects.toThrow('Device is not allowed to authenticate');
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: 'DEVICE_AUTH_FAILED', reason: 'device_status_revoked' }),
      }),
      expect.objectContaining({ actorType: 'device' }),
      tenantId,
      {},
    );
  });

  it('rejects suspended device API keys and records auth failure', async () => {
    repository.findOne.mockResolvedValueOnce(buildDevice({ status: 'suspended' }));

    await expect(service.validateDeviceKey('suspended-device-key')).rejects.toThrow(
      'Device is not allowed to authenticate',
    );
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: 'DEVICE_AUTH_FAILED', reason: 'device_status_suspended' }),
      }),
      expect.objectContaining({ actorType: 'device' }),
      tenantId,
      {},
    );
  });

  it('records a heartbeat and marks last seen', (done) => {
    const entity = buildDevice();
    repository.findOne
      .mockResolvedValueOnce(entity)
      .mockResolvedValueOnce(entity);
    repository.save.mockImplementationOnce(async (device: DeviceEntity) => buildDevice(device));

    service.heartbeat('raw-device-key', { status: 'online', metrics: { battery: 97 } }).subscribe({
      next: (heartbeat) => {
        expect(heartbeat.deviceId).toBe(entity.id);
        expect(heartbeat.lastSeenAt).toBeTruthy();
        expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({ action: 'DEVICE_HEARTBEAT', metrics: { battery: 97 } }),
          }),
          expect.objectContaining({ actorType: 'device' }),
          tenantId,
          {},
        );
        done();
      },
      error: done,
    });
  });

  it('records heartbeat from an already authenticated device actor', (done) => {
    const entity = buildDevice();
    repository.findOne.mockResolvedValueOnce(entity);
    repository.save.mockImplementationOnce(async (device: DeviceEntity) => buildDevice(device));

    service
      .heartbeatForActor(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        { status: 'online', metrics: { battery: 88 } },
      )
      .subscribe({
        next: (heartbeat) => {
          expect(heartbeat.deviceId).toBe(entity.id);
          expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              payload: expect.objectContaining({ action: 'DEVICE_HEARTBEAT', metrics: { battery: 88 } }),
            }),
            expect.objectContaining({ actorType: 'device', userId: entity.id }),
            tenantId,
            {},
          );
          done();
        },
        error: done,
      });
  });

  it('auto-suspends after three consecutive degraded heartbeats', async () => {
    const entity = buildDevice({ heartbeatFailureCount: 2 });
    repository.findOne.mockResolvedValueOnce(entity);
    repository.save.mockImplementationOnce(async (device: DeviceEntity) => buildDevice(device));

    const heartbeat = await new Promise((resolve, reject) => {
      service
        .heartbeatForActor(
          {
            userId: entity.id,
            actorType: 'device',
            tenantId,
            permissions: entity.permissions,
            deviceId: entity.id,
            deviceType: entity.type,
          },
          { status: 'degraded', metrics: { battery: 9 } },
        )
        .subscribe({ next: resolve, error: reject });
    });

    expect(heartbeat).toMatchObject({ deviceId: entity.id, status: 'suspended' });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'suspended',
      heartbeatFailureCount: 3,
      autoSuspendedAt: expect.any(Date),
    }));
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'DEVICE_AUTO_SUSPENDED',
          heartbeatFailureCount: 3,
          threshold: 3,
        }),
      }),
      expect.objectContaining({ actorType: 'device', userId: entity.id }),
      tenantId,
      {},
    );
  });

  it('ingests a single device event and returns event id with server timestamp', (done) => {
    const entity = buildDevice();

    service
      .ingestDeviceEvent(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        {
          eventType: 'SCAN_RECEIVED',
          payload: { sku: 'SKU-100', quantity: 1 },
          nonce: 'nonce-1',
        },
      )
      .subscribe({
        next: (response) => {
          expect(response).toEqual({
            eventId: '7f6e0f65-8855-4e4a-8e0c-a88d076f3d8f',
            serverTimestamp: now.toISOString(),
            nonce: 'nonce-1',
          });
          expect(nonceRepository.delete).toHaveBeenCalledTimes(1);
          expect(nonceRepository.delete).toHaveBeenCalledWith({
            createdAt: expect.any(Object),
          });
          expect(nonceRepository.save).toHaveBeenCalledWith({
            deviceId: entity.id,
            nonceValue: 'nonce-1',
          });
          expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'DEVICE_LEDGER_EVENT',
              subjectType: 'device',
              subjectId: entity.id,
              deviceId: entity.id,
              deviceType: entity.type,
              payload: expect.objectContaining({
                action: 'DEVICE_EVENT_RECEIVED',
                eventType: 'SCAN_RECEIVED',
                nonce: 'nonce-1',
                eventPayload: { sku: 'SKU-100', quantity: 1 },
              }),
            }),
            expect.objectContaining({ actorType: 'device', userId: entity.id }),
            tenantId,
            {},
            undefined,
          );
          done();
        },
        error: done,
      });
  });

  it('rejects a duplicate device event nonce and records replay audit', (done) => {
    const entity = buildDevice();
    nonceRepository.save.mockRejectedValueOnce({ code: '23505' });
    repository.findOne.mockResolvedValueOnce(entity);

    service
      .ingestDeviceEvent(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        {
          eventType: 'SCAN_RECEIVED',
          payload: { sku: 'SKU-100', quantity: 1 },
          nonce: 'nonce-1',
        },
      )
      .subscribe({
        next: () => done(new Error('Expected duplicate nonce to fail')),
        error: (error) => {
          expect(error.message).toContain('Device event nonce has already been used');
          expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              payload: expect.objectContaining({
                action: 'REPLAY_ATTACK_DETECTED',
                nonce: 'nonce-1',
              }),
            }),
            expect.objectContaining({ actorType: 'device' }),
            tenantId,
            {},
          );
          done();
        },
      });
  });

  it('rejects device event ingestion when device lacks write permission', (done) => {
    const entity = buildDevice({ permissions: ['device.heartbeat.write', 'device.status.read'] });

    service
      .ingestDeviceEvent(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        {
          eventType: 'SCAN_RECEIVED',
          payload: { sku: 'SKU-200' },
        },
      )
      .subscribe({
        next: () => done(new Error('Expected device event ingestion to fail')),
        error: (error) => {
          expect(error).toBeInstanceOf(Error);
          done();
        },
      });
  });

  it('ingests batch device events and returns per-item success results', (done) => {
    const entity = buildDevice();

    service
      .ingestDeviceEventsBatch(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        {
          events: [
            { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-1' } },
            { eventType: 'SCAN_CONFIRMED', payload: { sku: 'SKU-1', ok: true } },
          ],
        },
      )
      .subscribe({
        next: (response) => {
          expect(response.results).toHaveLength(2);
          expect(response.results.every((result) => result.success)).toBe(true);
          expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
          expect(nonceRepository.save).not.toHaveBeenCalled();
          expect(ledgerEventsService.appendEvent).toHaveBeenCalledTimes(2);
          done();
        },
        error: done,
      });
  });

  it('rolls back batch writes when one event fails and reports per-item failure', (done) => {
    const entity = buildDevice();
    (ledgerEventsService.appendEvent as jest.Mock)
      .mockReturnValueOnce(
        of({
          id: '7f6e0f65-8855-4e4a-8e0c-a88d076f3d8f',
          metadata: { timestamp: now.toISOString() },
        }),
      )
      .mockImplementationOnce(() => {
        throw new Error('append failed');
      });

    service
      .ingestDeviceEventsBatch(
        {
          userId: entity.id,
          actorType: 'device',
          tenantId,
          permissions: entity.permissions,
          deviceId: entity.id,
          deviceType: entity.type,
        },
        {
          events: [
            { eventType: 'SCAN_RECEIVED', payload: { sku: 'SKU-2' } },
            { eventType: 'SCAN_FAILED', payload: { sku: 'SKU-2' } },
          ],
        },
      )
      .subscribe({
        next: (response) => {
          expect(response.results).toEqual([
            expect.objectContaining({
              index: 0,
              success: false,
              error: expect.stringContaining('Rolled back due to batch failure at index 1'),
            }),
            expect.objectContaining({ index: 1, success: false, error: expect.stringContaining('append failed') }),
          ]);
          expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
          done();
        },
        error: done,
      });
  });
});
