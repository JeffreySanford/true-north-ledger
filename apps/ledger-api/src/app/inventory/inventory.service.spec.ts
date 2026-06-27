import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import type { CreateInventoryItemRequest } from '@true-north-ledger/inventory-contracts';
import { InventoryLedgerEventAction } from '@true-north-ledger/inventory-contracts';
import type { LedgerEventsService } from '../ledger-events/ledger-events.service';
import { InventoryItemEntity } from './inventory-item.entity';
import { InventoryService } from './inventory.service';

const tenantId = '00000000-0000-0000-0000-000000000000';
const now = new Date('2026-06-11T12:00:00.000Z');
const actor = { userId: 'inventory-admin', actorType: 'user', tenantId };
const createRequest: CreateInventoryItemRequest = {
  sku: 'SKU-100',
  name: 'Serialized sensor kit',
  description: 'Sensor kit',
  locationId: 'AUSTIN-A1',
  locationName: 'Austin Warehouse - Aisle A1',
  quantity: 25,
  unitOfMeasure: 'each',
  batchNumber: 'LOT-42',
  metadata: { source: 'unit-test' },
};

function buildEntity(overrides: Partial<InventoryItemEntity> = {}): InventoryItemEntity {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    tenantId,
    sku: 'SKU-100',
    name: 'Serialized sensor kit',
    description: 'Sensor kit',
    locationId: 'AUSTIN-A1',
    locationName: 'Austin Warehouse - Aisle A1',
    quantity: 25,
    reservedQuantity: 0,
    reservationOrderId: null,
    unitOfMeasure: 'each',
    status: 'available',
    batchNumber: 'LOT-42',
    serialNumber: null,
    expirationDate: null,
    metadata: { source: 'unit-test' },
    createdAt: now,
    updatedAt: now,
    lastScannedAt: null,
    removalReason: null,
    removedAt: null,
    ...overrides,
  } as InventoryItemEntity;
}

function awaitSingle<T>(source: { subscribe: (handlers: { next(value: T): void; error(error: unknown): void }) => void }): Promise<T> {
  return new Promise<T>((resolve, reject) => source.subscribe({ next: resolve, error: reject }));
}

describe('InventoryService', () => {
  let service: InventoryService;
  let repository: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let ledgerEventsService: Pick<LedgerEventsService, 'appendEvent' | 'findSubjectEvents'>;
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[buildEntity()], 1]),
    };
    repository = {
      save: jest.fn(async (entity: InventoryItemEntity) =>
        buildEntity({ ...entity, createdAt: now, updatedAt: now }),
      ),
      find: jest.fn(async () => [buildEntity({ quantity: 2 })]),
      findOne: jest.fn(async () => buildEntity()),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    ledgerEventsService = {
      appendEvent: jest.fn(() => of({ id: 'event-1' })),
      findSubjectEvents: jest.fn(() => of([])),
    } as unknown as Pick<LedgerEventsService, 'appendEvent' | 'findSubjectEvents'>;
    service = new InventoryService(repository as never, ledgerEventsService as LedgerEventsService);
  });

  it('adds available inventory and appends complete provenance metadata', async () => {
    const item = await awaitSingle(
      service.addItem(createRequest, actor, { userAgent: 'inventory-spec' }),
    );

    expect(item).toMatchObject({
      tenantId,
      sku: 'SKU-100',
      quantity: 25,
      status: 'available',
      locationId: 'AUSTIN-A1',
    });
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'inventory',
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_ADDED,
          sku: 'SKU-100',
          locationId: 'AUSTIN-A1',
          quantity: 25,
          status: 'available',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'inventory-spec' },
    );
  });

  it('lists only tenant inventory with filters, sorting, and pagination', async () => {
    const result = await awaitSingle(
      service.listItems(tenantId, {
        locationId: 'AUSTIN-A1',
        status: 'available',
        query: 'sensor',
        page: 2,
        pageSize: 5,
        sortBy: 'quantity',
        sortDirection: 'asc',
      }),
    );

    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 5 });
    expect(queryBuilder.where).toHaveBeenCalledWith('inventory.tenantId = :tenantId', { tenantId });
    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(3);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('inventory.quantity', 'ASC', 'NULLS LAST');
    expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });

  it('gets tenant inventory by ID and normalized SKU', async () => {
    const byId = await awaitSingle(service.getItem(buildEntity().id, tenantId));
    expect(byId).toMatchObject({ id: buildEntity().id, sku: 'SKU-100' });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: buildEntity().id, tenantId } });

    const bySku = await awaitSingle(service.getItemBySku(' sku-100 ', tenantId));
    expect(bySku).toMatchObject({ id: buildEntity().id, sku: 'SKU-100' });
    expect(repository.findOne).toHaveBeenLastCalledWith({ where: { sku: 'SKU-100', tenantId } });
  });

  it('gets tenant inventory with a provenance timeline when requested', async () => {
    ledgerEventsService.findSubjectEvents = jest.fn(() => of([{
      id: '66666666-6666-4666-8666-666666666666',
      actorType: 'user',
      actorId: 'inventory-admin',
      deviceId: null,
      deviceType: null,
      payload: {
        action: InventoryLedgerEventAction.INVENTORY_ADDED,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 25,
        reservedQuantity: 0,
      },
      metadata: {
        timestamp: '2026-06-12T05:01:00.000Z',
        chainSequence: 1,
        eventHash: 'hash-1',
      },
    }]));

    const detail = await awaitSingle(service.getItemWithProvenance(buildEntity().id, tenantId));

    expect(detail.item).toMatchObject({ id: buildEntity().id, sku: 'SKU-100' });
    expect(detail.events).toEqual([
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_ADDED, chainSequence: 1 }),
    ]);
    expect(ledgerEventsService.findSubjectEvents).toHaveBeenCalledWith(tenantId, 'inventory', buildEntity().id);
  });

  it('does not return inventory lookup results outside the tenant', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(awaitSingle(service.getItem(buildEntity().id, tenantId))).rejects.toBeInstanceOf(NotFoundException);
    await expect(awaitSingle(service.getItemBySku('SKU-100', tenantId))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a conflict when a tenant SKU already exists', async () => {
    repository.save.mockRejectedValue({ code: '23505' });

    await expect(awaitSingle(service.addItem(createRequest, actor))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ledgerEventsService.appendEvent).not.toHaveBeenCalled();
  });

  it('reserves available quantity, links an order, and records provenance', async () => {
    const orderId = '77777777-7777-4777-8777-777777777777';
    const item = await awaitSingle(service.reserveItem(
      buildEntity().id,
      tenantId,
      { quantity: 5, orderId },
      actor,
      { userAgent: 'inventory-spec' },
    ));

    expect(item).toMatchObject({
      quantity: 20,
      reservedQuantity: 5,
      reservationOrderId: orderId,
      status: 'reserved',
    });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_RESERVED,
          quantity: 20,
          reservedQuantity: 5,
          orderId,
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'inventory-spec' },
    );
  });

  it('releases expired reservations and records timeout provenance', async () => {
    const expired = buildEntity({
      quantity: 20,
      reservedQuantity: 5,
      reservationOrderId: '77777777-7777-4777-8777-777777777777',
      status: 'reserved',
      metadata: { reservationExpiresAt: '2026-06-11T11:00:00.000Z' },
    });
    const active = buildEntity({
      id: '66666666-6666-4666-8666-666666666666',
      sku: 'SKU-ACTIVE',
      quantity: 8,
      reservedQuantity: 2,
      status: 'reserved',
      metadata: { reservationExpiresAt: '2099-01-01T00:00:00.000Z' },
    });
    repository.find.mockResolvedValue([expired, active]);

    const response = await awaitSingle(service.releaseExpiredReservations(
      tenantId,
      actor,
      { userAgent: 'timeout-spec' },
    ));

    expect(response.total).toBe(1);
    expect(response.released).toEqual([
      expect.objectContaining({
        sku: 'SKU-100',
        quantity: 25,
        reservedQuantity: 0,
        reservationOrderId: null,
        status: 'available',
        metadata: {},
      }),
    ]);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'SKU-100',
      quantity: 25,
      reservedQuantity: 0,
      status: 'available',
      metadata: {},
    }));
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_RESERVATION_RELEASED,
          reason: 'Reservation timeout expired',
          reservationExpiredAt: '2026-06-11T11:00:00.000Z',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'timeout-spec' },
    );
  });

  it('releases a reservation and restores available quantity', async () => {
    repository.findOne.mockResolvedValue(buildEntity({
      quantity: 20,
      reservedQuantity: 5,
      reservationOrderId: '77777777-7777-4777-8777-777777777777',
      status: 'reserved',
    }));

    const item = await awaitSingle(service.releaseReservation(
      buildEntity().id,
      tenantId,
      { reason: 'Order cancelled' },
      actor,
    ));

    expect(item).toMatchObject({
      quantity: 25,
      reservedQuantity: 0,
      reservationOrderId: null,
      status: 'available',
    });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_RESERVATION_RELEASED,
          releasedQuantity: 5,
          reason: 'Order cancelled',
        }),
      }),
      actor,
      tenantId,
      {},
    );
  });

  it('rejects over-reservation, overlapping reservation, missing items, and empty release', async () => {
    await expect(awaitSingle(service.reserveItem(buildEntity().id, tenantId, { quantity: 26 }, actor)))
      .rejects.toBeInstanceOf(BadRequestException);

    repository.findOne.mockResolvedValue(buildEntity({ reservedQuantity: 1, status: 'reserved' }));
    await expect(awaitSingle(service.reserveItem(buildEntity().id, tenantId, { quantity: 1 }, actor)))
      .rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity());
    await expect(awaitSingle(service.releaseReservation(buildEntity().id, tenantId, {}, actor)))
      .rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(null);
    await expect(awaitSingle(service.reserveItem(buildEntity().id, tenantId, { quantity: 1 }, actor)))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('moves inventory while preserving quantity and reservation state and records from/to provenance', async () => {
    repository.findOne.mockResolvedValue(buildEntity({
      quantity: 20,
      reservedQuantity: 5,
      reservationOrderId: '77777777-7777-4777-8777-777777777777',
      status: 'reserved',
    }));

    const item = await awaitSingle(service.moveItem(
      buildEntity().id,
      tenantId,
      { locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2', reason: 'Rebalance' },
      actor,
      { userAgent: 'inventory-spec' },
    ));

    expect(item).toMatchObject({
      locationId: 'AUSTIN-B2',
      locationName: 'Austin Warehouse - Aisle B2',
      quantity: 20,
      reservedQuantity: 5,
      status: 'reserved',
    });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_MOVED,
          fromLocation: { id: 'AUSTIN-A1', name: 'Austin Warehouse - Aisle A1' },
          toLocation: { id: 'AUSTIN-B2', name: 'Austin Warehouse - Aisle B2' },
          reason: 'Rebalance',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'inventory-spec' },
    );
  });

  it('adjusts active inventory quantity and records previous/current quantity provenance', async () => {
    const item = await awaitSingle(service.adjustQuantity(
      buildEntity().id,
      tenantId,
      { quantity: 18, reason: 'Cycle count reconciliation' },
      actor,
      { userAgent: 'quantity-spec' },
    ));

    expect(item).toMatchObject({ quantity: 18, status: 'available' });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_QUANTITY_ADJUSTED,
          previousQuantity: 25,
          adjustedQuantity: 18,
          delta: -7,
          reason: 'Cycle count reconciliation',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'quantity-spec' },
    );
  });

  it('rejects invalid quantity adjustments for removed, reserved, and unchanged inventory', async () => {
    repository.findOne.mockResolvedValue(buildEntity({ status: 'removed' }));
    await expect(awaitSingle(service.adjustQuantity(
      buildEntity().id,
      tenantId,
      { quantity: 18, reason: 'Invalid' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity({ quantity: 2, reservedQuantity: 3, status: 'reserved' }));
    await expect(awaitSingle(service.adjustQuantity(
      buildEntity().id,
      tenantId,
      { quantity: 2, reason: 'Invalid' },
      actor,
    ))).rejects.toBeInstanceOf(BadRequestException);

    repository.findOne.mockResolvedValue(buildEntity());
    await expect(awaitSingle(service.adjustQuantity(
      buildEntity().id,
      tenantId,
      { quantity: 25, reason: 'No change' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);
  });

  it('changes active inventory status and records previous/current status provenance', async () => {
    const item = await awaitSingle(service.changeStatus(
      buildEntity().id,
      tenantId,
      { status: 'damaged', reason: 'Quality hold' },
      actor,
      { userAgent: 'status-spec' },
    ));

    expect(item).toMatchObject({ status: 'damaged' });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_STATUS_CHANGED,
          previousStatus: 'available',
          status: 'damaged',
          reason: 'Quality hold',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'status-spec' },
    );
  });

  it('rejects status changes that bypass reservation/removal workflows or active reservations', async () => {
    await expect(awaitSingle(service.changeStatus(
      buildEntity().id,
      tenantId,
      { status: 'reserved', reason: 'Invalid' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);

    await expect(awaitSingle(service.changeStatus(
      buildEntity().id,
      tenantId,
      { status: 'removed', reason: 'Invalid' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity({ quantity: 20, reservedQuantity: 5, status: 'reserved' }));
    await expect(awaitSingle(service.changeStatus(
      buildEntity().id,
      tenantId,
      { status: 'damaged', reason: 'Invalid' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity());
    await expect(awaitSingle(service.changeStatus(
      buildEntity().id,
      tenantId,
      { status: 'available', reason: 'No change' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects same-location and removed-item moves', async () => {
    await expect(awaitSingle(service.moveItem(
      buildEntity().id,
      tenantId,
      { locationId: 'AUSTIN-A1', locationName: 'Austin Warehouse - Aisle A1' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity({ status: 'removed' }));
    await expect(awaitSingle(service.moveItem(
      buildEntity().id,
      tenantId,
      { locationId: 'AUSTIN-B2', locationName: 'Austin Warehouse - Aisle B2' },
      actor,
    ))).rejects.toBeInstanceOf(ConflictException);
  });

  it('bulk moves inventory with per-item success and rejection results', async () => {
    repository.findOne
      .mockResolvedValueOnce(buildEntity())
      .mockResolvedValueOnce(buildEntity({ id: '66666666-6666-4666-8666-666666666666', status: 'removed' }));

    const response = await awaitSingle(service.moveItemsBatch(
      tenantId,
      {
        itemIds: [buildEntity().id, '66666666-6666-4666-8666-666666666666'],
        locationId: 'AUSTIN-C3',
        locationName: 'Austin Warehouse - Aisle C3',
        reason: 'Bulk rebalance',
      },
      actor,
      { userAgent: 'bulk-move-spec' },
    ));

    expect(response.results).toEqual([
      expect.objectContaining({
        index: 0,
        itemId: buildEntity().id,
        success: true,
        item: expect.objectContaining({ locationId: 'AUSTIN-C3' }),
      }),
      expect.objectContaining({
        index: 1,
        itemId: '66666666-6666-4666-8666-666666666666',
        success: false,
        error: 'Removed inventory cannot be moved',
      }),
    ]);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledTimes(1);
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_MOVED,
          reason: 'Bulk rebalance',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'bulk-move-spec' },
    );
  });

  it('imports inventory with per-item success and duplicate rejection results', async () => {
    repository.save
      .mockResolvedValueOnce(buildEntity({ sku: 'SKU-IMPORT-1', name: 'Imported one' }))
      .mockRejectedValueOnce({ code: '23505' });

    const response = await awaitSingle(service.importItemsBatch(
      {
        items: [
          { ...createRequest, sku: 'SKU-IMPORT-1', name: 'Imported one' },
          { ...createRequest, sku: 'SKU-100', name: 'Duplicate import' },
        ],
      },
      actor,
      { userAgent: 'bulk-import-spec' },
    ));

    expect(response.results).toEqual([
      expect.objectContaining({
        index: 0,
        sku: 'SKU-IMPORT-1',
        success: true,
        item: expect.objectContaining({ sku: 'SKU-IMPORT-1' }),
      }),
      expect.objectContaining({
        index: 1,
        sku: 'SKU-100',
        success: false,
        error: 'Inventory SKU SKU-100 already exists for tenant',
      }),
    ]);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledTimes(1);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_ADDED,
          sku: 'SKU-IMPORT-1',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'bulk-import-spec' },
    );
  });

  it('soft-removes inventory, zeros quantity, and records the removal reason', async () => {
    const item = await awaitSingle(service.removeItem(
      buildEntity().id,
      tenantId,
      { reason: 'Damaged beyond repair' },
      actor,
      { userAgent: 'inventory-spec' },
    ));

    expect(item).toMatchObject({
      quantity: 0,
      reservedQuantity: 0,
      reservationOrderId: null,
      status: 'removed',
      removalReason: 'Damaged beyond repair',
      removedAt: expect.any(String),
    });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_REMOVED,
          previousQuantity: 25,
          quantity: 0,
          reason: 'Damaged beyond repair',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'inventory-spec' },
    );
  });

  it('rejects removal of reserved or already removed inventory', async () => {
    repository.findOne.mockResolvedValue(buildEntity({ status: 'reserved', reservedQuantity: 2 }));
    await expect(awaitSingle(service.removeItem(buildEntity().id, tenantId, { reason: 'Invalid' }, actor)))
      .rejects.toBeInstanceOf(ConflictException);

    repository.findOne.mockResolvedValue(buildEntity({ status: 'removed', quantity: 0 }));
    await expect(awaitSingle(service.removeItem(buildEntity().id, tenantId, { reason: 'Again' }, actor)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('scans inventory by tenant SKU and records device-attributed provenance', async () => {
    const deviceActor = {
      userId: 'scanner-1',
      actorType: 'device' as const,
      tenantId,
      deviceId: 'scanner-1',
      deviceType: 'scanner',
    };
    const item = await awaitSingle(service.scanItem(
      { value: 'sku-100', scanType: 'barcode', locationId: 'AUSTIN-A1' },
      deviceActor,
      { userAgent: 'scanner-spec' },
    ));

    expect(repository.findOne).toHaveBeenCalledWith({
      where: [
        { tenantId, sku: 'SKU-100' },
        { tenantId, serialNumber: 'sku-100' },
      ],
    });
    expect(item.lastScannedAt).toEqual(expect.any(String));
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_SCANNED,
          scanType: 'barcode',
          scanValue: 'sku-100',
          scannedLocationId: 'AUSTIN-A1',
          deviceId: 'scanner-1',
          deviceType: 'scanner',
        }),
      }),
      deviceActor,
      tenantId,
      { userAgent: 'scanner-spec' },
    );
  });

  it('rejects scans that do not match tenant inventory', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(awaitSingle(service.scanItem(
      { value: 'UNKNOWN', scanType: 'manual' },
      actor,
    ))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects wrong-location scans while recording scan and anomaly events', async () => {
    await expect(awaitSingle(service.scanItem(
      { value: 'SKU-100', scanType: 'barcode', locationId: 'AUSTIN-B2' },
      actor,
      { userAgent: 'wrong-location-spec' },
    ))).rejects.toBeInstanceOf(ConflictException);

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      lastScannedAt: expect.any(Date),
      metadata: expect.objectContaining({
        lastLocationMismatch: expect.objectContaining({
          expectedLocationId: 'AUSTIN-A1',
          scannedLocationId: 'AUSTIN-B2',
        }),
      }),
    }));
    expect(ledgerEventsService.appendEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_SCANNED,
          accepted: false,
          rejectionReason: 'unexpected_location',
          scannedLocationId: 'AUSTIN-B2',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'wrong-location-spec' },
    );
    expect(ledgerEventsService.appendEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_ANOMALY_DETECTED,
          anomalyType: 'unexpected_location',
          expectedLocationId: 'AUSTIN-A1',
          scannedLocationId: 'AUSTIN-B2',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'wrong-location-spec' },
    );
  });

  it('clears a persisted location mismatch after a correct-location scan', async () => {
    repository.findOne.mockResolvedValue(buildEntity({
      metadata: {
        source: 'unit-test',
        lastLocationMismatch: {
          expectedLocationId: 'AUSTIN-A1',
          scannedLocationId: 'AUSTIN-B2',
          detectedAt: now.toISOString(),
        },
      },
    }));

    const scanned = await awaitSingle(service.scanItem(
      { value: 'SKU-100', scanType: 'manual', locationId: 'AUSTIN-A1' },
      actor,
    ));
    expect(scanned.metadata).toEqual({ source: 'unit-test' });
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ accepted: true }) }),
      actor,
      tenantId,
      {},
    );
  });

  it('bulk scans inventory and reports per-item success without discarding accepted scans', async () => {
    repository.findOne
      .mockResolvedValueOnce(buildEntity())
      .mockResolvedValueOnce(null);

    const response = await awaitSingle(service.scanItemsBatch({
      scans: [
        { value: 'SKU-100', scanType: 'barcode', locationId: 'AUSTIN-A1' },
        { value: 'UNKNOWN', scanType: 'barcode', locationId: 'AUSTIN-A1' },
      ],
    }, actor, { userAgent: 'batch-scan-spec' }));

    expect(response.results).toEqual([
      expect.objectContaining({ index: 0, value: 'SKU-100', success: true, item: expect.objectContaining({ sku: 'SKU-100' }) }),
      expect.objectContaining({ index: 1, value: 'UNKNOWN', success: false, error: 'Inventory item UNKNOWN not found' }),
    ]);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(ledgerEventsService.appendEvent).toHaveBeenCalledTimes(1);
  });

  it('returns chronological inventory provenance with actor, location, quantity, and chain metadata', async () => {
    (ledgerEventsService.findSubjectEvents as jest.Mock).mockReturnValue(of([{
      id: '66666666-6666-4666-8666-666666666666',
      actorType: 'device',
      actorId: 'scanner-1',
      deviceId: 'scanner-1',
      deviceType: 'scanner',
      payload: {
        action: InventoryLedgerEventAction.INVENTORY_SCANNED,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 25,
        reservedQuantity: 0,
      },
      metadata: {
        timestamp: '2026-06-12T05:00:00.000Z',
        chainSequence: 2,
        eventHash: 'hash-2',
      },
    }, {
      id: '77777777-7777-4777-8777-777777777777',
      actorType: 'user',
      actorId: 'inventory-admin',
      deviceId: null,
      deviceType: null,
      payload: {
        action: InventoryLedgerEventAction.INVENTORY_RESERVED,
        locationId: 'AUSTIN-A1',
        locationName: 'Austin Warehouse - Aisle A1',
        quantity: 20,
        reservedQuantity: 5,
      },
      metadata: {
        timestamp: '2026-06-12T05:01:00.000Z',
        chainSequence: 3,
        eventHash: 'hash-3',
      },
    }]));

    const provenance = await awaitSingle(service.getProvenance(buildEntity().id, tenantId));
    expect(ledgerEventsService.findSubjectEvents).toHaveBeenCalledWith(tenantId, 'inventory', buildEntity().id);
    expect(provenance.events).toEqual([
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_SCANNED,
        actorId: 'scanner-1',
        locationId: 'AUSTIN-A1',
        quantity: 25,
        chainSequence: 2,
      }),
      expect.objectContaining({
        action: InventoryLedgerEventAction.INVENTORY_RESERVED,
        reservedQuantity: 5,
      }),
    ]);
    expect(provenance.scanHistory).toEqual([
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_SCANNED }),
    ]);
    expect(provenance.reservationHistory).toEqual([
      expect.objectContaining({ action: InventoryLedgerEventAction.INVENTORY_RESERVED }),
    ]);
  });

  it('detects and filters low-stock, expired, damaged, missing-scan, and location anomalies', async () => {
    const old = new Date('2026-04-01T12:00:00.000Z');
    repository.find.mockResolvedValue([
      buildEntity({ quantity: 2, metadata: { minimumQuantity: 5 } }),
      buildEntity({ id: '66666666-6666-4666-8666-666666666666', sku: 'SKU-EXPIRED', expirationDate: '2026-01-01' }),
      buildEntity({ id: '77777777-7777-4777-8777-777777777777', sku: 'SKU-DAMAGED', status: 'damaged' }),
      buildEntity({ id: '88888888-8888-4888-8888-888888888888', sku: 'SKU-STALE', createdAt: old, updatedAt: old }),
      buildEntity({
        id: '99999999-9999-4999-8999-999999999999',
        sku: 'SKU-MISPLACED',
        metadata: { lastLocationMismatch: { scannedLocationId: 'AUSTIN-B2', detectedAt: now.toISOString() } },
      }),
      buildEntity({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sku: 'SKU-COUNT',
        quantity: 8,
        metadata: { expectedQuantity: 10 },
      }),
      buildEntity({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sku: 'SKU-UNEXPECTED-MOVE',
        locationId: 'AUSTIN-C3',
        locationName: 'Austin Warehouse - Aisle C3',
        metadata: {
          expectedLocationId: 'AUSTIN-A1',
          expectedLocationName: 'Austin Warehouse - Aisle A1',
        },
      }),
    ]);

    const result = await awaitSingle(service.listAnomalies(tenantId));
    expect(result.anomalies.map((anomaly) => anomaly.type)).toEqual(expect.arrayContaining([
      'low_stock', 'expired', 'damaged_not_removed', 'missing_scan', 'unexpected_location', 'quantity_discrepancy',
    ]));
    expect(result.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sku: 'SKU-COUNT',
        type: 'quantity_discrepancy',
        details: expect.objectContaining({ quantity: 8, expectedQuantity: 10, delta: -2 }),
      }),
      expect.objectContaining({
        sku: 'SKU-UNEXPECTED-MOVE',
        type: 'unexpected_location',
        details: expect.objectContaining({
          currentLocationId: 'AUSTIN-C3',
          expectedLocationId: 'AUSTIN-A1',
        }),
      }),
    ]));

    const critical = await awaitSingle(service.listAnomalies(tenantId, { severity: 'critical' }));
    expect(critical.anomalies).toEqual([expect.objectContaining({ type: 'expired', severity: 'critical' })]);

    const quantityDiscrepancy = await awaitSingle(service.listAnomalies(tenantId, { type: 'quantity_discrepancy' }));
    expect(quantityDiscrepancy.anomalies).toEqual([
      expect.objectContaining({ sku: 'SKU-COUNT', severity: 'error' }),
    ]);

    const detectedOnJuneEleven = await awaitSingle(service.listAnomalies(tenantId, {
      detectedFrom: '2026-06-11',
      detectedTo: '2026-06-11',
    }));
    expect(detectedOnJuneEleven.anomalies.map((anomaly) => anomaly.sku)).toEqual(expect.arrayContaining([
      'SKU-100',
      'SKU-MISPLACED',
    ]));
    expect(detectedOnJuneEleven.anomalies.map((anomaly) => anomaly.sku)).not.toContain('SKU-STALE');
  });

  it('records an anomaly detection ledger event for each finding', async () => {
    repository.find.mockResolvedValue([buildEntity({ quantity: 2 })]);
    const result = await awaitSingle(service.detectAnomalies(actor, { userAgent: 'anomaly-spec' }));
    expect(result.total).toBe(1);
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_ANOMALY_DETECTED,
          anomalyType: 'low_stock',
          severity: 'warning',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'anomaly-spec' },
    );
  });

  it('lists filtered low-stock, expiring-soon, and anomaly alerts', async () => {
    const expiringSoonDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    repository.find.mockResolvedValue([
      buildEntity({ quantity: 2, metadata: { minimumQuantity: 5 } }),
      buildEntity({
        id: '66666666-6666-4666-8666-666666666666',
        sku: 'SKU-EXPIRING',
        expirationDate: expiringSoonDate,
      }),
      buildEntity({
        id: '77777777-7777-4777-8777-777777777777',
        sku: 'SKU-DAMAGED',
        status: 'damaged',
      }),
    ]);

    const result = await awaitSingle(service.listAlerts(tenantId));
    expect(result.alerts.map((alert) => alert.type)).toEqual(
      expect.arrayContaining(['low_stock', 'expiring_soon', 'anomaly']),
    );
    const warning = await awaitSingle(service.listAlerts(tenantId, { type: 'low_stock', severity: 'warning' }));
    expect(warning.alerts).toEqual([expect.objectContaining({ type: 'low_stock', action: 'Replenish inventory.' })]);
  });

  it('generates alert-specific ledger events', async () => {
    repository.find.mockResolvedValue([buildEntity({ quantity: 2 })]);
    const result = await awaitSingle(service.generateAlerts(actor, { userAgent: 'alert-spec' }));
    expect(result.total).toBe(1);
    expect(ledgerEventsService.appendEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: InventoryLedgerEventAction.INVENTORY_LOW_STOCK,
          alertType: 'low_stock',
          recommendedAction: 'Replenish inventory.',
        }),
      }),
      actor,
      tenantId,
      { userAgent: 'alert-spec' },
    );
  });
});
