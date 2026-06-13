import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { from, map, Observable } from 'rxjs';
import { Repository } from 'typeorm';
import {
  CreateInventoryItemRequest,
  InventoryAlert,
  InventoryAlertListResponse,
  InventoryAlertSeverity,
  InventoryAlertType,
  InventoryAnomaly,
  InventoryAnomalyListResponse,
  InventoryAnomalySeverity,
  InventoryAnomalyType,
  InventoryItem,
  InventoryLedgerEventAction,
  InventoryLedgerEventActionSchema,
  InventoryListRequest,
  InventoryListResponse,
  InventoryMoveRequest,
  InventoryProvenanceEvent,
  InventoryProvenanceResponse,
  InventoryReservationReleaseRequest,
  InventoryReservationRequest,
  InventoryRemovalRequest,
  InventoryScanRequest,
} from '@true-north-ledger/inventory-contracts';
import {
  AuthenticatedLedgerActor,
  LedgerEventsService,
  LedgerRequestContext,
} from '../ledger-events/ledger-events.service';
import { InventoryItemEntity } from './inventory-item.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly inventoryRepository: Repository<InventoryItemEntity>,
    private readonly ledgerEventsService: LedgerEventsService,
  ) {}

  addItem(
    request: CreateInventoryItemRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistItem(request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  listItems(
    tenantId: string,
    filters: Partial<InventoryListRequest> = {},
  ): Observable<InventoryListResponse> {
    return from(this.findItems(tenantId, filters)).pipe(
      map(([entities, total]) => ({
        items: entities.map((entity) => this.toInventoryItem(entity)),
        total,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 25,
      })),
    );
  }

  getItem(id: string, tenantId: string): Observable<InventoryItem> {
    return from(this.findTenantItem(id, tenantId)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  getItemBySku(sku: string, tenantId: string): Observable<InventoryItem> {
    return from(this.findTenantItemBySku(sku, tenantId)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  reserveItem(
    id: string,
    tenantId: string,
    request: InventoryReservationRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistReservation(id, tenantId, request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  releaseReservation(
    id: string,
    tenantId: string,
    request: InventoryReservationReleaseRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistReservationRelease(id, tenantId, request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  moveItem(
    id: string,
    tenantId: string,
    request: InventoryMoveRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistMove(id, tenantId, request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  removeItem(
    id: string,
    tenantId: string,
    request: InventoryRemovalRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistRemoval(id, tenantId, request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  scanItem(
    request: InventoryScanRequest,
    actor: AuthenticatedLedgerActor & { deviceId?: string; deviceType?: string },
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryItem> {
    return from(this.persistScan(request, actor, requestContext)).pipe(
      map((entity) => this.toInventoryItem(entity)),
    );
  }

  getProvenance(id: string, tenantId: string): Observable<InventoryProvenanceResponse> {
    return from(this.buildProvenance(id, tenantId));
  }

  listAnomalies(
    tenantId: string,
    filters: { type?: InventoryAnomalyType; severity?: InventoryAnomalySeverity } = {},
  ): Observable<InventoryAnomalyListResponse> {
    return from(this.buildAnomalies(tenantId, filters));
  }

  detectAnomalies(
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryAnomalyListResponse> {
    return from(this.persistAnomalyDetection(actor, requestContext));
  }

  listAlerts(
    tenantId: string,
    filters: { type?: InventoryAlertType; severity?: InventoryAlertSeverity } = {},
  ): Observable<InventoryAlertListResponse> {
    return from(this.buildAlerts(tenantId, filters));
  }

  generateAlerts(
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<InventoryAlertListResponse> {
    return from(this.persistAlertGeneration(actor, requestContext));
  }

  private async persistItem(
    request: CreateInventoryItemRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const entity = new InventoryItemEntity();
    entity.id = randomUUID();
    entity.tenantId = actor.tenantId;
    entity.sku = request.sku;
    entity.name = request.name;
    entity.description = request.description ?? '';
    entity.locationId = request.locationId;
    entity.locationName = request.locationName;
    entity.quantity = request.quantity;
    entity.reservedQuantity = 0;
    entity.reservationOrderId = null;
    entity.unitOfMeasure = request.unitOfMeasure;
    entity.status = 'available';
    entity.batchNumber = request.batchNumber ?? null;
    entity.serialNumber = request.serialNumber ?? null;
    entity.expirationDate = request.expirationDate ?? null;
    entity.metadata = request.metadata ?? {};
    entity.lastScannedAt = null;
    entity.removalReason = null;
    entity.removedAt = null;

    let saved: InventoryItemEntity;
    try {
      saved = await this.inventoryRepository.save(entity);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Inventory SKU ${request.sku} already exists for tenant`);
      }
      throw error;
    }

    await this.awaitObservable(
      this.ledgerEventsService.appendEvent(
        {
          type: 'LEDGER_EVENT',
          subjectType: 'inventory',
          subjectId: saved.id,
          payload: {
            action: InventoryLedgerEventAction.INVENTORY_ADDED,
            sku: saved.sku,
            name: saved.name,
            locationId: saved.locationId,
            locationName: saved.locationName,
            quantity: saved.quantity,
            unitOfMeasure: saved.unitOfMeasure,
            status: saved.status,
          },
        },
        actor,
        actor.tenantId,
        requestContext,
      ),
    );

    return saved;
  }

  private async persistReservation(
    id: string,
    tenantId: string,
    request: InventoryReservationRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const entity = await this.findTenantItem(id, tenantId);
    if (entity.status === 'removed') {
      throw new ConflictException('Removed inventory cannot be reserved');
    }
    if (entity.reservedQuantity > 0) {
      throw new ConflictException('Inventory item already has an active reservation');
    }
    if (request.quantity > entity.quantity) {
      throw new BadRequestException('Reservation quantity exceeds available quantity');
    }

    entity.quantity -= request.quantity;
    entity.reservedQuantity = request.quantity;
    entity.reservationOrderId = request.orderId ?? null;
    entity.status = 'reserved';
    const saved = await this.inventoryRepository.save(entity);
    await this.appendInventoryEvent(
      saved,
      InventoryLedgerEventAction.INVENTORY_RESERVED,
      actor,
      requestContext,
      { reservedQuantity: request.quantity, orderId: request.orderId ?? null },
    );
    return saved;
  }

  private async persistReservationRelease(
    id: string,
    tenantId: string,
    request: InventoryReservationReleaseRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const entity = await this.findTenantItem(id, tenantId);
    if (entity.reservedQuantity <= 0) {
      throw new ConflictException('Inventory item does not have an active reservation');
    }
    const releasedQuantity = entity.reservedQuantity;
    const orderId = entity.reservationOrderId ?? null;
    entity.quantity += releasedQuantity;
    entity.reservedQuantity = 0;
    entity.reservationOrderId = null;
    entity.status = 'available';
    const saved = await this.inventoryRepository.save(entity);
    await this.appendInventoryEvent(
      saved,
      InventoryLedgerEventAction.INVENTORY_RESERVATION_RELEASED,
      actor,
      requestContext,
      { releasedQuantity, orderId, reason: request.reason },
    );
    return saved;
  }

  private async persistMove(
    id: string,
    tenantId: string,
    request: InventoryMoveRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const entity = await this.findTenantItem(id, tenantId);
    if (entity.status === 'removed') {
      throw new ConflictException('Removed inventory cannot be moved');
    }
    if (entity.locationId === request.locationId && entity.locationName === request.locationName) {
      throw new ConflictException('Inventory item is already at the requested location');
    }
    const fromLocation = { id: entity.locationId, name: entity.locationName };
    entity.locationId = request.locationId;
    entity.locationName = request.locationName;
    const saved = await this.inventoryRepository.save(entity);
    await this.appendInventoryEvent(
      saved,
      InventoryLedgerEventAction.INVENTORY_MOVED,
      actor,
      requestContext,
      {
        fromLocation,
        toLocation: { id: saved.locationId, name: saved.locationName },
        reason: request.reason,
      },
    );
    return saved;
  }

  private async persistRemoval(
    id: string,
    tenantId: string,
    request: InventoryRemovalRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const entity = await this.findTenantItem(id, tenantId);
    if (entity.status === 'removed') {
      throw new ConflictException('Inventory item is already removed');
    }
    if (entity.reservedQuantity > 0 || entity.status === 'reserved') {
      throw new ConflictException('Reserved inventory must be released before removal');
    }
    const previousQuantity = entity.quantity;
    entity.quantity = 0;
    entity.reservedQuantity = 0;
    entity.reservationOrderId = null;
    entity.status = 'removed';
    entity.removalReason = request.reason;
    entity.removedAt = new Date();
    const saved = await this.inventoryRepository.save(entity);
    await this.appendInventoryEvent(
      saved,
      InventoryLedgerEventAction.INVENTORY_REMOVED,
      actor,
      requestContext,
      { previousQuantity, reason: request.reason, removedAt: saved.removedAt?.toISOString() },
    );
    return saved;
  }

  private async persistScan(
    request: InventoryScanRequest,
    actor: AuthenticatedLedgerActor & { deviceId?: string; deviceType?: string },
    requestContext: LedgerRequestContext,
  ): Promise<InventoryItemEntity> {
    const value = request.value.trim();
    const entity = await this.inventoryRepository.findOne({
      where: [
        { tenantId: actor.tenantId, sku: value.toUpperCase() },
        { tenantId: actor.tenantId, serialNumber: value },
      ],
    });
    if (!entity) throw new NotFoundException(`Inventory item ${value} not found`);

    entity.lastScannedAt = new Date();
    const saved = await this.inventoryRepository.save(entity);
    await this.appendInventoryEvent(
      saved,
      InventoryLedgerEventAction.INVENTORY_SCANNED,
      actor,
      requestContext,
      {
        scanType: request.scanType,
        scanValue: value,
        scannedLocationId: request.locationId ?? null,
        deviceId: actor.deviceId ?? null,
        deviceType: actor.deviceType ?? null,
        scannedAt: saved.lastScannedAt?.toISOString(),
      },
    );
    return saved;
  }

  private async buildProvenance(id: string, tenantId: string): Promise<InventoryProvenanceResponse> {
    const entity = await this.findTenantItem(id, tenantId);
    const events = await this.awaitObservable(
      this.ledgerEventsService.findSubjectEvents(tenantId, 'inventory', id),
    );
    return {
      item: this.toInventoryItem(entity),
      events: events.map((event) => this.toProvenanceEvent(event)),
    };
  }

  private async buildAnomalies(
    tenantId: string,
    filters: { type?: InventoryAnomalyType; severity?: InventoryAnomalySeverity } = {},
  ): Promise<InventoryAnomalyListResponse> {
    const entities = await this.inventoryRepository.find({ where: { tenantId } });
    const anomalies = entities
      .flatMap((entity) => this.detectItemAnomalies(entity))
      .filter((anomaly) => !filters.type || anomaly.type === filters.type)
      .filter((anomaly) => !filters.severity || anomaly.severity === filters.severity);
    return { anomalies, total: anomalies.length };
  }

  private async persistAnomalyDetection(
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryAnomalyListResponse> {
    const result = await this.buildAnomalies(actor.tenantId);
    for (const anomaly of result.anomalies) {
      const entity = await this.findTenantItem(anomaly.itemId, actor.tenantId);
      await this.appendInventoryEvent(
        entity,
        InventoryLedgerEventAction.INVENTORY_ANOMALY_DETECTED,
        actor,
        requestContext,
        {
          anomalyId: anomaly.id,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          message: anomaly.message,
          remediation: anomaly.remediation,
          detectedAt: anomaly.detectedAt,
        },
      );
    }
    return result;
  }

  private async buildAlerts(
    tenantId: string,
    filters: { type?: InventoryAlertType; severity?: InventoryAlertSeverity } = {},
  ): Promise<InventoryAlertListResponse> {
    const entities = await this.inventoryRepository.find({ where: { tenantId } });
    const alerts = entities
      .flatMap((entity) => this.detectItemAlerts(entity))
      .filter((alert) => !filters.type || alert.type === filters.type)
      .filter((alert) => !filters.severity || alert.severity === filters.severity);
    return { alerts, total: alerts.length };
  }

  private async persistAlertGeneration(
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<InventoryAlertListResponse> {
    const result = await this.buildAlerts(actor.tenantId);
    for (const alert of result.alerts) {
      const entity = await this.findTenantItem(alert.itemId, actor.tenantId);
      const action = alert.type === 'low_stock'
        ? InventoryLedgerEventAction.INVENTORY_LOW_STOCK
        : alert.type === 'expiring_soon'
          ? InventoryLedgerEventAction.INVENTORY_EXPIRING_SOON
          : InventoryLedgerEventAction.INVENTORY_ANOMALY;
      await this.appendInventoryEvent(entity, action, actor, requestContext, {
        alertId: alert.id,
        alertType: alert.type,
        severity: alert.severity,
        message: alert.message,
        recommendedAction: alert.action,
        createdAt: alert.createdAt,
        ...alert.details,
      });
    }
    return result;
  }

  private detectItemAlerts(entity: InventoryItemEntity): InventoryAlert[] {
    if (entity.status === 'removed') return [];
    const alerts: InventoryAlert[] = [];
    const minimumQuantity = typeof entity.metadata?.['minimumQuantity'] === 'number'
      ? entity.metadata['minimumQuantity']
      : 5;
    if (entity.quantity <= minimumQuantity) {
      alerts.push(this.alert(entity, 'low_stock', 'warning',
        `${entity.sku} has ${entity.quantity} ${entity.unitOfMeasure} available; minimum is ${minimumQuantity}.`,
        'Replenish inventory.',
        { quantity: entity.quantity, minimumQuantity }));
    }

    if (entity.expirationDate) {
      const expirationAlertDays = typeof entity.metadata?.['expirationAlertDays'] === 'number'
        ? entity.metadata['expirationAlertDays']
        : 30;
      const expirationTime = new Date(`${entity.expirationDate}T23:59:59.999Z`).getTime();
      const daysUntilExpiration = Math.ceil((expirationTime - Date.now()) / 86_400_000);
      if (daysUntilExpiration >= 0 && daysUntilExpiration <= expirationAlertDays) {
        alerts.push(this.alert(entity, 'expiring_soon', daysUntilExpiration <= 7 ? 'error' : 'warning',
          `${entity.sku} expires in ${daysUntilExpiration} days on ${entity.expirationDate}.`,
          'Review, rotate, or quarantine expiring inventory.',
          { expirationDate: entity.expirationDate, daysUntilExpiration, expirationAlertDays }));
      }
    }

    for (const anomaly of this.detectItemAnomalies(entity)) {
      if (anomaly.type === 'low_stock') continue;
      alerts.push(this.alert(entity, 'anomaly', anomaly.severity, anomaly.message, anomaly.remediation, {
        anomalyId: anomaly.id,
        anomalyType: anomaly.type,
      }));
    }
    return alerts;
  }

  private alert(
    entity: InventoryItemEntity,
    type: InventoryAlertType,
    severity: InventoryAlertSeverity,
    message: string,
    action: string,
    details: Record<string, unknown>,
  ): InventoryAlert {
    return {
      id: `${entity.id}:${type}:${details['anomalyType'] ?? type}`,
      itemId: entity.id,
      sku: entity.sku,
      name: entity.name,
      type,
      severity,
      message,
      locationId: entity.locationId,
      locationName: entity.locationName,
      createdAt: entity.updatedAt.toISOString(),
      action,
      details,
    };
  }

  private detectItemAnomalies(entity: InventoryItemEntity): InventoryAnomaly[] {
    if (entity.status === 'removed') return [];
    const anomalies: InventoryAnomaly[] = [];
    const minimumQuantity =
      typeof entity.metadata?.['minimumQuantity'] === 'number'
        ? entity.metadata['minimumQuantity']
        : 5;
    if (entity.quantity <= minimumQuantity) {
      anomalies.push(this.anomaly(entity, 'low_stock', 'warning',
        `${entity.sku} has ${entity.quantity} ${entity.unitOfMeasure} available; minimum is ${minimumQuantity}.`,
        'Replenish inventory or adjust the minimum quantity threshold.',
        { quantity: entity.quantity, minimumQuantity }));
    }
    if (entity.expirationDate && new Date(`${entity.expirationDate}T23:59:59.999Z`).getTime() < Date.now()) {
      anomalies.push(this.anomaly(entity, 'expired', 'critical',
        `${entity.sku} expired on ${entity.expirationDate}.`,
        'Quarantine and remove expired inventory.',
        { expirationDate: entity.expirationDate }));
    }
    if (entity.status === 'damaged') {
      anomalies.push(this.anomaly(entity, 'damaged_not_removed', 'error',
        `${entity.sku} is damaged but remains active inventory.`,
        'Review and remove damaged inventory when appropriate.',
        { status: entity.status }));
    }
    const scanReference = entity.lastScannedAt ?? entity.createdAt;
    const missingScanDays = Math.floor((Date.now() - scanReference.getTime()) / 86_400_000);
    if (missingScanDays >= 30) {
      anomalies.push(this.anomaly(entity, 'missing_scan', 'warning',
        `${entity.sku} has not been scanned for ${missingScanDays} days.`,
        'Perform a location-confirming inventory scan.',
        { missingScanDays, lastScannedAt: entity.lastScannedAt?.toISOString() ?? null }));
    }
    return anomalies;
  }

  private anomaly(
    entity: InventoryItemEntity,
    type: InventoryAnomalyType,
    severity: InventoryAnomalySeverity,
    message: string,
    remediation: string,
    details: Record<string, unknown>,
  ): InventoryAnomaly {
    return {
      id: `${entity.id}:${type}`,
      itemId: entity.id,
      sku: entity.sku,
      name: entity.name,
      type,
      severity,
      status: 'open',
      message,
      locationId: entity.locationId,
      locationName: entity.locationName,
      detectedAt: entity.updatedAt.toISOString(),
      remediation,
      details,
    };
  }

  private toProvenanceEvent(event: {
    id: string;
    actorType: string;
    actorId: string;
    deviceId?: string;
    deviceType?: string;
    payload: Record<string, unknown>;
    metadata: { timestamp: string; chainSequence: number; eventHash: string };
  }): InventoryProvenanceEvent {
    const payload = event.payload;
    return {
      eventId: event.id,
      action: InventoryLedgerEventActionSchema.parse(payload['action']),
      actorType: event.actorType,
      actorId: event.actorId,
      deviceId: event.deviceId ?? (typeof payload['deviceId'] === 'string' ? payload['deviceId'] : null),
      deviceType: event.deviceType ?? (typeof payload['deviceType'] === 'string' ? payload['deviceType'] : null),
      locationId: typeof payload['locationId'] === 'string' ? payload['locationId'] : null,
      locationName: typeof payload['locationName'] === 'string' ? payload['locationName'] : null,
      quantity: typeof payload['quantity'] === 'number' ? payload['quantity'] : null,
      reservedQuantity: typeof payload['reservedQuantity'] === 'number' ? payload['reservedQuantity'] : null,
      details: payload,
      timestamp: event.metadata.timestamp,
      chainSequence: event.metadata.chainSequence,
      eventHash: event.metadata.eventHash,
    };
  }

  private async findTenantItem(id: string, tenantId: string): Promise<InventoryItemEntity> {
    const entity = await this.inventoryRepository.findOne({ where: { id, tenantId } });
    if (!entity) throw new NotFoundException(`Inventory item ${id} not found`);
    return entity;
  }

  private async findTenantItemBySku(sku: string, tenantId: string): Promise<InventoryItemEntity> {
    const normalizedSku = sku.trim().toUpperCase();
    const entity = await this.inventoryRepository.findOne({ where: { sku: normalizedSku, tenantId } });
    if (!entity) throw new NotFoundException(`Inventory SKU ${normalizedSku} not found`);
    return entity;
  }

  private async appendInventoryEvent(
    entity: InventoryItemEntity,
    action: InventoryLedgerEventAction,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.awaitObservable(
      this.ledgerEventsService.appendEvent(
        {
          type: 'LEDGER_EVENT',
          subjectType: 'inventory',
          subjectId: entity.id,
          payload: {
            action,
            sku: entity.sku,
            locationId: entity.locationId,
            locationName: entity.locationName,
            quantity: entity.quantity,
            reservedQuantity: entity.reservedQuantity,
            status: entity.status,
            ...details,
          },
        },
        actor,
        entity.tenantId,
        requestContext,
      ),
    );
  }

  private findItems(
    tenantId: string,
    filters: Partial<InventoryListRequest>,
  ): Promise<[InventoryItemEntity[], number]> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortDirection = filters.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const sortColumn: Record<InventoryListRequest['sortBy'], string> = {
      quantity: 'inventory.quantity',
      lastScannedAt: 'inventory.lastScannedAt',
      createdAt: 'inventory.createdAt',
    };

    const query = this.inventoryRepository
      .createQueryBuilder('inventory')
      .where('inventory.tenantId = :tenantId', { tenantId })
      .orderBy(sortColumn[sortBy], sortDirection, 'NULLS LAST')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filters.locationId) {
      query.andWhere('inventory.locationId = :locationId', { locationId: filters.locationId });
    }
    if (filters.status) {
      query.andWhere('inventory.status = :status', { status: filters.status });
    }
    if (filters.query) {
      query.andWhere('(inventory.sku ILIKE :query OR inventory.name ILIKE :query)', {
        query: `%${filters.query}%`,
      });
    }

    return query.getManyAndCount();
  }

  private toInventoryItem(entity: InventoryItemEntity): InventoryItem {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      sku: entity.sku,
      name: entity.name,
      description: entity.description,
      locationId: entity.locationId,
      locationName: entity.locationName,
      quantity: entity.quantity,
      reservedQuantity: entity.reservedQuantity,
      reservationOrderId: entity.reservationOrderId ?? null,
      unitOfMeasure: entity.unitOfMeasure,
      status: entity.status,
      batchNumber: entity.batchNumber ?? null,
      serialNumber: entity.serialNumber ?? null,
      expirationDate: entity.expirationDate ?? null,
      metadata: entity.metadata,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      lastScannedAt: entity.lastScannedAt?.toISOString() ?? null,
      removalReason: entity.removalReason ?? null,
      removedAt: entity.removedAt?.toISOString() ?? null,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private awaitObservable<T>(source: Observable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let resolved = false;
      source.subscribe({
        next: (value) => {
          if (!resolved) {
            resolved = true;
            resolve(value);
          }
        },
        error: reject,
        complete: () => {
          if (!resolved) reject(new Error('Observable completed without a value'));
        },
      });
    });
  }
}
