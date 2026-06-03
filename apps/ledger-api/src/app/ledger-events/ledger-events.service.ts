import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { createHash, randomUUID } from 'crypto';
import {
  AppendLedgerEventDtoSchema,
  DeviceLedgerEventSchema,
  LedgerEventResponse,
  LedgerEventSchema,
} from '@true-north-ledger/ledger-contracts';
import { LedgerEventEntity } from './ledger-event.entity';

@Injectable()
export class LedgerEventsService {
  constructor(
    @InjectRepository(LedgerEventEntity)
    private readonly ledgerEventRepository: Repository<LedgerEventEntity>,
  ) {}

  findAll(): Observable<LedgerEventResponse[]> {
    return from(
      this.ledgerEventRepository.find({
        order: { createdAt: 'ASC' },
      })
    ).pipe(
      map((entities) => entities.map((entity) => this.entityToResponse(entity))),
      catchError((error) => {
        console.error('Failed to fetch events', error);
        return throwError(() => error);
      })
    );
  }

  findOne(id: string): Observable<LedgerEventResponse> {
    return from(this.ledgerEventRepository.findOne({ where: { id } })).pipe(
      map((entity) => {
        if (!entity) {
          throw new Error(`Ledger event ${id} not found`);
        }
        return this.entityToResponse(entity);
      }),
      catchError((error) => {
        console.error(`Failed to fetch event ${id}`, error);
        return throwError(() => error);
      })
    );
  }

  appendEvent(payload: unknown): Observable<LedgerEventResponse> {
    try {
      const dto = AppendLedgerEventDtoSchema.parse(payload);
      const computedHash = this.computePayloadHash(dto.payload);

      if (dto.metadata.payloadHash !== computedHash) {
        return throwError(() => new Error('payloadHash mismatch for supplied payload'));
      }

      const entity = new LedgerEventEntity();
      entity.id = randomUUID();
      entity.type = dto.type;
      entity.actorType = dto.actorType;
      entity.actorId = dto.actorId;
      entity.subjectType = dto.subjectType;
      entity.subjectId = dto.subjectId;
      entity.payload = dto.payload;
      entity.tenantId = dto.metadata.tenantId;
      entity.requestId = dto.metadata.requestId;
      entity.correlationId = dto.metadata.correlationId;
      entity.sourceIp = dto.metadata.sourceIp;
      entity.userAgent = dto.metadata.userAgent ?? '';
      entity.payloadHash = dto.metadata.payloadHash;
      entity.previousHash = dto.metadata.previousHash;
      entity.result = dto.metadata.result === 'failed' ? 'rejected' : dto.metadata.result;
      entity.timestamp = new Date(dto.metadata.timestamp);

      if (dto.type === 'DEVICE_LEDGER_EVENT') {
        entity.deviceId = (dto as any).deviceId ?? '';
        entity.deviceType = (dto as any).deviceType ?? '';
      }

      return from(this.ledgerEventRepository.save(entity)).pipe(
        map((savedEntity) => this.entityToResponse(savedEntity)),
        catchError((error) => {
          console.error('Failed to append event', error);
          return throwError(() => error);
        })
      );
    } catch (error) {
      return throwError(() => error);
    }
  }

  private entityToResponse(entity: LedgerEventEntity): LedgerEventResponse {
    const baseEvent = {
      id: entity.id,
      type: entity.type,
      actorType: entity.actorType,
      actorId: entity.actorId,
      subjectType: entity.subjectType,
      subjectId: entity.subjectId,
      payload: entity.payload,
      metadata: {
        tenantId: entity.tenantId,
        requestId: entity.requestId,
        correlationId: entity.correlationId ?? undefined,
        sourceIp: entity.sourceIp ?? undefined,
        userAgent: entity.userAgent,
        payloadHash: entity.payloadHash,
        previousHash: entity.previousHash ?? undefined,
        result: entity.result as 'accepted' | 'rejected' | 'failed',
        timestamp: entity.timestamp.toISOString(),
      },
      createdAt: entity.createdAt.toISOString(),
    };

    if (entity.type === 'DEVICE_LEDGER_EVENT') {
      return DeviceLedgerEventSchema.parse({
        ...baseEvent,
        deviceId: entity.deviceId ?? '',
        deviceType: entity.deviceType ?? '',
      });
    }

    return LedgerEventSchema.parse(baseEvent);
  }

  private computePayloadHash(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
