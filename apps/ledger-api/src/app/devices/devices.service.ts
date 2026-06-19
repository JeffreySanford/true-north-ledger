import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  Device,
  DeviceBatchEventIngestResponse,
  DeviceBatchEventRequest,
  DeviceEventIngestResponse,
  DeviceEventRequest,
  DeviceHeartbeatRequest,
  DeviceHeartbeatResponse,
  DeviceLedgerEventAction,
  DeviceListResponse,
  DevicePermission,
  DeviceProvisioningPayload,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceStatus,
  DeviceStatusUpdateRequest,
  DeviceType,
} from '@true-north-ledger/device-contracts';
import {
  AuthenticatedLedgerActor,
  LedgerEventsService,
  LedgerRequestContext,
} from '../ledger-events/ledger-events.service';
import { InventoryScanRequestSchema } from '@true-north-ledger/inventory-contracts';
import { InventoryService } from '../inventory/inventory.service';
import { DeviceEntity } from './device.entity';
import { DeviceNonceEntity } from './device-nonce.entity';

export interface DeviceActor {
  userId: string;
  actorType: 'device';
  tenantId: string;
  permissions: DevicePermission[];
  deviceId: string;
  deviceType: DeviceType;
}

const DEFAULT_DEVICE_PERMISSIONS: DevicePermission[] = [
  'device.heartbeat.write',
  'device.events.write',
  'device.status.read',
];
const DEVICE_NONCE_TTL_MS = 5 * 60 * 1000;
const HEARTBEAT_AUTO_SUSPEND_THRESHOLD = 3;

class DeviceBatchTransactionError extends Error {
  constructor(
    public readonly failedIndex: number,
    public readonly failedMessage: string,
  ) {
    super(`Device batch failed at index ${failedIndex}: ${failedMessage}`);
  }
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceNonceEntity)
    private readonly nonceRepository: Repository<DeviceNonceEntity>,
    private readonly ledgerEventsService: LedgerEventsService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
  ) {}

  registerDevice(
    request: DeviceRegistrationRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<DeviceRegistrationResponse> {
    return from(this.createDevice(request, actor, requestContext)).pipe(
      catchError((error) => {
        if (error?.code === '23505') {
          throw new ConflictException('Device name already exists for tenant');
        }
        throw error;
      }),
    );
  }

  listDevices(
    tenantId: string,
    filters: { status?: DeviceStatus; type?: DeviceType; search?: string; page?: number; pageSize?: number } = {},
  ): Observable<DeviceListResponse> {
    return from(this.findDevices(tenantId, filters)).pipe(
      map(([entities, total]) => ({
        devices: entities.map((entity) => this.toDevice(entity)),
        total,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      })),
    );
  }

  getDeviceStatus(id: string, tenantId: string): Observable<Device> {
    return from(this.findTenantDevice(id, tenantId)).pipe(map((entity) => this.toDevice(entity)));
  }

  updateDeviceStatus(
    id: string,
    tenantId: string,
    request: DeviceStatusUpdateRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<Device> {
    return from(this.setDeviceStatus(id, tenantId, request, actor, requestContext)).pipe(
      map((entity) => this.toDevice(entity)),
    );
  }

  revokeDevice(
    id: string,
    tenantId: string,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext = {},
  ): Observable<Device> {
    return from(
      this.setDeviceStatus(id, tenantId, { status: 'revoked', reason: 'Device revoked by admin' }, actor, requestContext),
    ).pipe(map((entity) => this.toDevice(entity)));
  }

  heartbeat(
    apiKey: string | undefined,
    request: DeviceHeartbeatRequest,
    requestContext: LedgerRequestContext = {},
  ): Observable<DeviceHeartbeatResponse> {
    return from(this.recordHeartbeat(apiKey, request, requestContext));
  }

  heartbeatForActor(
    actor: DeviceActor,
    request: DeviceHeartbeatRequest,
    requestContext: LedgerRequestContext = {},
  ): Observable<DeviceHeartbeatResponse> {
    return from(this.recordHeartbeatForActor(actor, request, requestContext));
  }

  ingestDeviceEvent(
    actor: DeviceActor,
    request: DeviceEventRequest,
    requestContext: LedgerRequestContext = {},
  ): Observable<DeviceEventIngestResponse> {
    return from(this.recordDeviceEvent(actor, request, requestContext));
  }

  ingestDeviceEventsBatch(
    actor: DeviceActor,
    request: DeviceBatchEventRequest,
    requestContext: LedgerRequestContext = {},
  ): Observable<DeviceBatchEventIngestResponse> {
    return from(this.recordDeviceEventsBatch(actor, request, requestContext));
  }

  async validateDeviceKey(apiKey: string | undefined, requestContext: LedgerRequestContext = {}): Promise<DeviceActor> {
    if (!apiKey) {
      throw new UnauthorizedException('Missing device API key');
    }

    const entity = await this.deviceRepository.findOne({
      where: { apiKeyHash: this.hashToken(apiKey) },
    });

    if (!entity) {
      throw new UnauthorizedException('Invalid device API key');
    }

    if (entity.status === 'revoked' || entity.status === 'suspended') {
      const deviceActor: DeviceActor = {
        userId: entity.id,
        actorType: 'device',
        tenantId: entity.tenantId,
        permissions: entity.permissions,
        deviceId: entity.id,
        deviceType: entity.type,
      };

      this.appendDeviceAudit(
        DeviceLedgerEventAction.DEVICE_AUTH_FAILED,
        entity,
        deviceActor,
        requestContext,
        {
          reason: `device_status_${entity.status}`,
        },
      );
      throw new UnauthorizedException('Device is not allowed to authenticate');
    }

    const deviceActor: DeviceActor = {
      userId: entity.id,
      actorType: 'device',
      tenantId: entity.tenantId,
      permissions: entity.permissions,
      deviceId: entity.id,
      deviceType: entity.type,
    };

    this.appendDeviceAudit(
      DeviceLedgerEventAction.DEVICE_AUTH_SUCCESS,
      entity,
      deviceActor,
      requestContext,
      {
        source: 'api_key',
      },
    );

    return {
      userId: entity.id,
      actorType: 'device',
      tenantId: entity.tenantId,
      permissions: entity.permissions,
      deviceId: entity.id,
      deviceType: entity.type,
    };
  }

  private async createDevice(
    request: DeviceRegistrationRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<DeviceRegistrationResponse> {
    const apiKey = this.generateApiKey();
    const entity = new DeviceEntity();
    entity.id = randomUUID();
    entity.name = request.name.trim();
    entity.type = request.type;
    entity.tenantId = actor.tenantId;
    entity.apiKeyHash = this.hashToken(apiKey);
    entity.status = 'active';
    entity.permissions = request.permissions?.length ? request.permissions : DEFAULT_DEVICE_PERMISSIONS;
    entity.metadata = request.metadata ?? {};
    entity.provisioningPayloadVersion = 1;
    entity.lastProvisionedAt = new Date();
    entity.lastSeenAt = null;
    entity.heartbeatFailureCount = 0;
    entity.autoSuspendedAt = null;
    entity.revokedAt = null;

    const saved = await this.deviceRepository.save(entity);
    const issuedAt = saved.lastProvisionedAt?.toISOString() ?? new Date().toISOString();
    const provisioningPayload = this.buildProvisioningPayload(saved, apiKey, issuedAt);
    this.appendDeviceAudit(DeviceLedgerEventAction.DEVICE_REGISTERED, saved, actor, requestContext, {
      permissions: saved.permissions,
      registeredBy: actor.userId,
      provisioningPayloadVersion: saved.provisioningPayloadVersion,
    });

    return {
      ...this.toDevice(saved),
      apiKey,
      provisioningPayload,
      provisioningUri: this.buildProvisioningUri(provisioningPayload),
    };
  }

  private async findDevices(
    tenantId: string,
    filters: { status?: DeviceStatus; type?: DeviceType; search?: string; page?: number; pageSize?: number },
  ): Promise<[DeviceEntity[], number]> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const query = this.deviceRepository
      .createQueryBuilder('device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .orderBy('device.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filters.status) {
      query.andWhere('device.status = :status', { status: filters.status });
    }

    if (filters.type) {
      query.andWhere('device.device_type = :type', { type: filters.type });
    }

    if (filters.search?.trim()) {
      query.andWhere('LOWER(device.device_name) LIKE :search', {
        search: `%${filters.search.trim().toLowerCase()}%`,
      });
    }

    return query.getManyAndCount();
  }

  private async findTenantDevice(id: string, tenantId: string): Promise<DeviceEntity> {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Device id must be a UUID');
    }

    const entity = await this.deviceRepository.findOne({ where: { id, tenantId } });
    if (!entity) {
      throw new NotFoundException('Device not found');
    }

    return entity;
  }

  private async setDeviceStatus(
    id: string,
    tenantId: string,
    request: DeviceStatusUpdateRequest,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
  ): Promise<DeviceEntity> {
    const entity = await this.findTenantDevice(id, tenantId);
    const previousStatus = entity.status;
    entity.status = request.status;
    entity.revokedAt = request.status === 'revoked' ? new Date() : entity.revokedAt;
    entity.heartbeatFailureCount = request.status === 'active' ? 0 : entity.heartbeatFailureCount;
    entity.autoSuspendedAt = request.status === 'active' ? null : entity.autoSuspendedAt;

    const saved = await this.deviceRepository.save(entity);
    this.appendDeviceAudit(
      request.status === 'revoked' ? DeviceLedgerEventAction.DEVICE_REVOKED : DeviceLedgerEventAction.DEVICE_STATUS_CHANGED,
      saved,
      actor,
      requestContext,
      {
        previousStatus,
        status: request.status,
        reason: request.reason,
      },
    );

    return saved;
  }

  private async recordHeartbeat(
    apiKey: string | undefined,
    request: DeviceHeartbeatRequest,
    requestContext: LedgerRequestContext,
  ): Promise<DeviceHeartbeatResponse> {
    const actor = await this.validateDeviceKey(apiKey, requestContext);
    return this.recordHeartbeatForActor(actor, request, requestContext);
  }

  private async recordHeartbeatForActor(
    actor: DeviceActor,
    request: DeviceHeartbeatRequest,
    requestContext: LedgerRequestContext,
  ): Promise<DeviceHeartbeatResponse> {
    const entity = await this.findTenantDevice(actor.deviceId, actor.tenantId);
    const now = new Date();
    entity.lastSeenAt = now;
    entity.status = entity.status === 'inactive' ? 'active' : entity.status;
    entity.heartbeatFailureCount =
      request.status === 'degraded' ? (entity.heartbeatFailureCount ?? 0) + 1 : 0;

    const shouldAutoSuspend =
      request.status === 'degraded' &&
      entity.status === 'active' &&
      entity.heartbeatFailureCount >= HEARTBEAT_AUTO_SUSPEND_THRESHOLD;
    const previousStatus = entity.status;
    if (shouldAutoSuspend) {
      entity.status = 'suspended';
      entity.autoSuspendedAt = now;
    }

    const saved = await this.deviceRepository.save(entity);
    this.appendDeviceAudit(DeviceLedgerEventAction.DEVICE_HEARTBEAT, saved, actor, requestContext, {
      heartbeatStatus: request.status ?? 'online',
      metrics: request.metrics ?? {},
      heartbeatFailureCount: saved.heartbeatFailureCount,
    });

    if (shouldAutoSuspend) {
      this.appendDeviceAudit(DeviceLedgerEventAction.DEVICE_AUTO_SUSPENDED, saved, actor, requestContext, {
        previousStatus,
        status: saved.status,
        reason: `Auto-suspended after ${HEARTBEAT_AUTO_SUSPEND_THRESHOLD} consecutive degraded heartbeats`,
        heartbeatFailureCount: saved.heartbeatFailureCount,
        threshold: HEARTBEAT_AUTO_SUSPEND_THRESHOLD,
      });
    }

    return {
      deviceId: saved.id,
      status: saved.status,
      serverTimestamp: now.toISOString(),
      lastSeenAt: saved.lastSeenAt?.toISOString() ?? now.toISOString(),
    };
  }

  private async recordDeviceEvent(
    actor: DeviceActor,
    request: DeviceEventRequest,
    requestContext: LedgerRequestContext,
    transactionManager?: EntityManager,
  ): Promise<DeviceEventIngestResponse> {
    if (!actor.permissions.includes('device.events.write')) {
      throw new ForbiddenException('Device does not have permission to submit events');
    }

    if (request.nonce) {
      await this.reserveNonce(actor, request.nonce, requestContext, transactionManager);
    }

    const eventTimestamp = request.timestamp ?? new Date().toISOString();
    const event = await this.resolveObservable(
      this.ledgerEventsService.appendEvent(
        {
          type: 'DEVICE_LEDGER_EVENT' as const,
          subjectType: 'device',
          subjectId: actor.deviceId,
          deviceId: actor.deviceId,
          deviceType: actor.deviceType,
          payload: {
            action: DeviceLedgerEventAction.DEVICE_EVENT_RECEIVED,
            eventType: request.eventType,
            eventTimestamp,
            nonce: request.nonce,
            eventPayload: request.payload,
          },
        },
        actor,
        actor.tenantId,
        requestContext,
        transactionManager,
      ),
    );

    if (request.eventType.trim().toLowerCase() === 'inventory.scan') {
      await this.trackInventoryScanFromDeviceEvent(actor, request, requestContext);
    }

    return {
      eventId: event.id,
      serverTimestamp: event.metadata.timestamp,
      nonce: request.nonce,
    };
  }

  private async trackInventoryScanFromDeviceEvent(
    actor: DeviceActor,
    request: DeviceEventRequest,
    requestContext: LedgerRequestContext,
  ): Promise<void> {
    const payload = request.payload;
    const value = this.stringPayloadValue(payload, 'value')
      ?? this.stringPayloadValue(payload, 'sku')
      ?? this.stringPayloadValue(payload, 'serialNumber')
      ?? this.stringPayloadValue(payload, 'barcode');
    const scanType = this.stringPayloadValue(payload, 'scanType')
      ?? (this.stringPayloadValue(payload, 'barcode') ? 'barcode' : 'manual');
    const locationId = this.stringPayloadValue(payload, 'locationId');
    const parsed = InventoryScanRequestSchema.safeParse({
      value,
      scanType,
      ...(locationId ? { locationId } : {}),
      sourceEventType: request.eventType,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    await this.resolveObservable(
      this.inventoryService.scanItem(parsed.data, actor, requestContext),
    );
  }

  private stringPayloadValue(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private async recordDeviceEventsBatch(
    actor: DeviceActor,
    request: DeviceBatchEventRequest,
    requestContext: LedgerRequestContext,
  ): Promise<DeviceBatchEventIngestResponse> {
    if (!actor.permissions.includes('device.events.write')) {
      throw new ForbiddenException('Device does not have permission to submit events');
    }

    const provisionalResults: Array<{
      index: number;
      eventId: string;
      serverTimestamp: string;
      nonce?: string;
    }> = [];

    try {
      await this.deviceRepository.manager.transaction(async (manager) => {
        for (const [index, eventRequest] of request.events.entries()) {
          try {
            const eventResult = await this.recordDeviceEvent(actor, eventRequest, requestContext, manager);
            provisionalResults.push({
              index,
              eventId: eventResult.eventId,
              serverTimestamp: eventResult.serverTimestamp,
              nonce: eventResult.nonce,
            });
          } catch (error) {
            throw new DeviceBatchTransactionError(
              index,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      });

      return {
        results: provisionalResults.map((result) => ({
          index: result.index,
          success: true,
          eventId: result.eventId,
          serverTimestamp: result.serverTimestamp,
          nonce: result.nonce,
        })),
      };
    } catch (error) {
      if (!(error instanceof DeviceBatchTransactionError)) {
        throw error;
      }

      return {
        results: request.events.map((_, index) => {
          if (index === error.failedIndex) {
            return { index, success: false, error: error.failedMessage };
          }

          if (index < error.failedIndex) {
            return {
              index,
              success: false,
              error: `Rolled back due to batch failure at index ${error.failedIndex}`,
            };
          }

          return {
            index,
            success: false,
            error: `Not processed due to batch failure at index ${error.failedIndex}`,
          };
        }),
      };
    }
  }

  private async reserveNonce(
    actor: DeviceActor,
    nonce: string,
    requestContext: LedgerRequestContext,
    transactionManager?: EntityManager,
  ): Promise<void> {
    const repository = transactionManager
      ? transactionManager.getRepository(DeviceNonceEntity)
      : this.nonceRepository;
    const expiresBefore = new Date(Date.now() - DEVICE_NONCE_TTL_MS);

    await repository.delete({ createdAt: LessThan(expiresBefore) });

    try {
      await repository.save({
        deviceId: actor.deviceId,
        nonceValue: nonce,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        await this.recordReplayDetected(actor, nonce, requestContext);
        throw new ConflictException('Device event nonce has already been used');
      }

      throw error;
    }
  }

  private async recordReplayDetected(
    actor: DeviceActor,
    nonce: string,
    requestContext: LedgerRequestContext,
  ): Promise<void> {
    const device = await this.findTenantDevice(actor.deviceId, actor.tenantId);
    this.appendDeviceAudit(DeviceLedgerEventAction.REPLAY_ATTACK_DETECTED, device, actor, requestContext, {
      nonce,
    });
  }

  private appendDeviceAudit(
    action: DeviceLedgerEventAction,
    device: DeviceEntity,
    actor: AuthenticatedLedgerActor,
    requestContext: LedgerRequestContext,
    payload: Record<string, unknown>,
  ): void {
    this.ledgerEventsService
      .appendEvent(
        {
          type: 'DEVICE_LEDGER_EVENT' as const,
          subjectType: 'device',
          subjectId: device.id,
          deviceId: device.id,
          deviceType: device.type,
          payload: {
            action,
            deviceName: device.name,
            deviceStatus: device.status,
            ...payload,
          },
        },
        actor,
        device.tenantId,
        requestContext,
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record device audit event', error);
          }
        },
      });
  }

  private toDevice(entity: DeviceEntity): Device {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      tenantId: entity.tenantId,
      status: entity.status,
      permissions: entity.permissions,
      metadata: entity.metadata,
      lastSeenAt: entity.lastSeenAt?.toISOString() ?? null,
      online: this.isOnline(entity),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      revokedAt: entity.revokedAt?.toISOString() ?? null,
      provisioningPayloadVersion: entity.provisioningPayloadVersion,
      lastProvisionedAt: entity.lastProvisionedAt?.toISOString() ?? null,
      heartbeatFailureCount: entity.heartbeatFailureCount ?? 0,
      autoSuspendedAt: entity.autoSuspendedAt?.toISOString() ?? null,
    };
  }

  private buildProvisioningPayload(
    entity: DeviceEntity,
    apiKey: string,
    issuedAt: string,
  ): DeviceProvisioningPayload {
    return {
      version: 1,
      deviceId: entity.id,
      deviceName: entity.name,
      deviceType: entity.type,
      tenantId: entity.tenantId,
      apiKey,
      heartbeatPath: '/api/v1/devices/heartbeat',
      deviceEventPath: '/api/v1/device-events',
      batchDeviceEventPath: '/api/v1/device-events/batch',
      issuedAt,
    };
  }

  private buildProvisioningUri(payload: DeviceProvisioningPayload): string {
    return `tnl-device://provision?payload=${encodeURIComponent(JSON.stringify(payload))}`;
  }

  private isOnline(entity: DeviceEntity): boolean {
    if (entity.status !== 'active' || !entity.lastSeenAt) {
      return false;
    }

    return Date.now() - entity.lastSeenAt.getTime() < 5 * 60 * 1000;
  }

  private generateApiKey(): string {
    return `tnl_dev_${randomBytes(32).toString('base64url')}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
  }

  private resolveObservable<T>(source: Observable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let emitted = false;
      source.subscribe({
        next: (value) => {
          if (!emitted) {
            emitted = true;
            resolve(value);
          }
        },
        error: reject,
        complete: () => {
          if (!emitted) {
            reject(new Error('Observable completed without a value'));
          }
        },
      });
    });
  }
}
