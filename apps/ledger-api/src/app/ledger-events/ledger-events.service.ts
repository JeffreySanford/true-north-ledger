import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import {
  AppendLedgerEventDtoSchema,
  DeviceLedgerEventSchema,
  LedgerChainVerificationResponse,
  LedgerChainVerificationResponseSchema,
  LedgerEventResponse,
  LedgerEventSchema,
} from '@true-north-ledger/ledger-contracts';
import { LedgerEventEntity } from './ledger-event.entity';

export interface AuthenticatedLedgerActor {
  userId: string;
  actorType: string;
  tenantId: string;
}

export interface LedgerRequestContext {
  sourceIp?: string;
  userAgent?: string | string[];
  correlationId?: string | string[];
}

@Injectable()
export class LedgerEventsService {
  constructor(
    @InjectRepository(LedgerEventEntity)
    private readonly ledgerEventRepository: Repository<LedgerEventEntity>,
  ) {}

  findAll(tenantId: string): Observable<LedgerEventResponse[]> {
    return from(
      this.ledgerEventRepository.find({
        where: { tenantId },
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

  findOne(id: string, tenantId: string): Observable<LedgerEventResponse> {
    if (!z.string().uuid().safeParse(id).success) {
      return throwError(() => new BadRequestException('Ledger event id must be a UUID'));
    }

    return from(this.ledgerEventRepository.findOne({ where: { id, tenantId } })).pipe(
      map((entity) => {
        if (!entity) {
          throw new NotFoundException(`Ledger event ${id} not found`);
        }
        return this.entityToResponse(entity);
      }),
      catchError((error) => {
        console.error(`Failed to fetch event ${id}`, error);
        return throwError(() => error);
      })
    );
  }

  verifyChain(tenantId: string): Observable<LedgerChainVerificationResponse> {
    return from(
      this.ledgerEventRepository.find({
        where: { tenantId },
        order: { chainSequence: 'ASC' },
      }),
    ).pipe(
      map((entities) => {
        const failures: LedgerChainVerificationResponse['failures'] = [];
        let previousHash: string | undefined;
        let expectedSequence = 1;

        for (const entity of entities) {
          const chainSequence = Number(entity.chainSequence);
          const recomputedHash = this.computeEventHash(entity);

          if (chainSequence !== expectedSequence) {
            failures.push({
              eventId: entity.id,
              chainSequence,
              reason: `Expected chain sequence ${expectedSequence}`,
            });
          }

          if (chainSequence === 1 && entity.previousHash) {
            failures.push({
              eventId: entity.id,
              chainSequence,
              reason: 'First event must not have a previous hash',
            });
          }

          if (chainSequence > 1 && entity.previousHash !== previousHash) {
            failures.push({
              eventId: entity.id,
              chainSequence,
              reason: 'Previous hash does not match prior event hash',
            });
          }

          if (entity.eventHash !== recomputedHash) {
            failures.push({
              eventId: entity.id,
              chainSequence,
              reason: 'Event hash does not match canonical event data',
            });
          }

          previousHash = entity.eventHash;
          expectedSequence += 1;
        }

        return LedgerChainVerificationResponseSchema.parse({
          tenantId,
          valid: failures.length === 0,
          checkedEvents: entities.length,
          headHash: previousHash,
          failures,
        });
      }),
      catchError((error) => {
        console.error(`Failed to verify ledger chain for tenant ${tenantId}`, error);
        return throwError(() => error);
      }),
    );
  }

  appendEvent(
    payload: unknown,
    authenticatedUser: AuthenticatedLedgerActor,
    tenantId: string,
    requestContext: LedgerRequestContext = {},
  ): Observable<LedgerEventResponse> {
    try {
      const dto = AppendLedgerEventDtoSchema.parse(payload);

      if (!authenticatedUser?.userId || !authenticatedUser.actorType || !tenantId) {
        throw new BadRequestException('Authenticated actor context is required');
      }

      const computedHash = this.computePayloadHash(dto.payload);
      const now = new Date();
      const requestId = randomUUID();
      const correlationId = this.getSingleHeaderValue(requestContext.correlationId) ?? randomUUID();

      return from(
        this.ledgerEventRepository.manager.transaction(async (manager) => {
          const repository = manager.getRepository(LedgerEventEntity);
          const previousEntity = await repository.findOne({
            where: { tenantId },
            order: { chainSequence: 'DESC' },
          });
          const previousHash = previousEntity?.eventHash ?? null;
          const chainSequence = previousEntity
            ? (BigInt(previousEntity.chainSequence) + 1n).toString()
            : '1';

          const entity = new LedgerEventEntity();
          entity.id = randomUUID();
          entity.type = dto.type;
          entity.actorType = authenticatedUser.actorType;
          entity.actorId = authenticatedUser.userId;
          entity.subjectType = dto.subjectType;
          entity.subjectId = dto.subjectId;
          entity.payload = dto.payload;
          entity.tenantId = tenantId;
          entity.requestId = requestId;
          entity.correlationId = correlationId;
          entity.sourceIp = requestContext.sourceIp;
          entity.userAgent = this.getSingleHeaderValue(requestContext.userAgent) ?? '';
          entity.payloadHash = computedHash;
          entity.previousHash = previousHash;
          entity.chainSequence = chainSequence;
          entity.result = 'accepted';
          entity.timestamp = now;

          if (dto.type === 'DEVICE_LEDGER_EVENT') {
            entity.deviceId = dto.deviceId;
            entity.deviceType = dto.deviceType;
          }

          entity.eventHash = this.computeEventHash(entity);

          return repository.save(entity);
        }),
      ).pipe(
        map((savedEntity) => this.entityToResponse(savedEntity)),
        catchError((error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to append event', error);
          }
          if (error instanceof BadRequestException) {
            return throwError(() => error);
          }
          if (error instanceof z.ZodError) {
            return throwError(
              () =>
                new BadRequestException({
                  message: 'Validation failed',
                  details: error.format(),
                }),
            );
          }
          if (error?.code === '23505') {
            return throwError(() => new ConflictException('Ledger chain sequence conflict'));
          }
          if (error?.code === 'P0001') {
            return throwError(() => new ConflictException('Ledger append-only constraint violation'));
          }
          return throwError(() => error);
        })
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return throwError(
          () =>
            new BadRequestException({
              message: 'Validation failed',
              details: error.format(),
            }),
        );
      }
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
        eventHash: entity.eventHash,
        chainSequence: Number(entity.chainSequence),
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
    return createHash('sha256').update(this.canonicalize(payload)).digest('hex');
  }

  private computeEventHash(entity: LedgerEventEntity): string {
    return createHash('sha256')
      .update(
        this.canonicalize({
          tenantId: entity.tenantId,
          actorType: entity.actorType,
          actorId: entity.actorId,
          type: entity.type,
          subjectType: entity.subjectType,
          subjectId: entity.subjectId,
          payloadHash: entity.payloadHash,
          previousHash: entity.previousHash,
          chainSequence: entity.chainSequence,
          result: entity.result,
          timestamp: entity.timestamp.toISOString(),
        }),
      )
      .digest('hex');
  }

  private canonicalize(value: unknown): string {
    return JSON.stringify(this.sortObject(value));
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortObject(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortObject(item)]),
      );
    }

    return value;
  }

  private getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
