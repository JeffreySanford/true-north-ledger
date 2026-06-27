import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { LedgerEventEntity } from './ledger-event.entity';
import { LedgerEventsService } from './ledger-events.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { MetricsService } from '../config/metrics.service';

describe('LedgerEventsService', () => {
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const actor = {
    userId: 'test-user',
    actorType: 'user',
    tenantId,
  };

  let service: LedgerEventsService;
  let repository: jest.Mocked<Repository<LedgerEventEntity>>;
  let transactionalRepository: jest.Mocked<Repository<LedgerEventEntity>>;
  let notificationsGateway: { emitLedgerEvent: jest.Mock };
  let metricsService: { recordLedgerEventCreated: jest.Mock };

  function computeEventHash(entity: LedgerEventEntity): string {
    return (service as unknown as { computeEventHash(entity: LedgerEventEntity): string }).computeEventHash(
      entity,
    );
  }

  beforeEach(async () => {
    transactionalRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<LedgerEventEntity>>;

    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn((callback) =>
          callback({
            getRepository: jest.fn(() => transactionalRepository),
          }),
        ),
      },
    } as unknown as jest.Mocked<Repository<LedgerEventEntity>>;
    notificationsGateway = { emitLedgerEvent: jest.fn() };
    metricsService = { recordLedgerEventCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerEventsService,
        {
          provide: getRepositoryToken(LedgerEventEntity),
          useValue: repository,
        },
        {
          provide: NotificationsGateway,
          useValue: notificationsGateway,
        },
        {
          provide: MetricsService,
          useValue: metricsService,
        },
      ],
    }).compile();

    service = module.get<LedgerEventsService>(LedgerEventsService);
  });

  function savedEntity(overrides: Partial<LedgerEventEntity> = {}): LedgerEventEntity {
    return {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'order',
      subjectId: 'order-1',
      payload: { action: 'created' },
      tenantId,
      requestId: 'request-1',
      correlationId: 'correlation-1',
      sourceIp: '127.0.0.1',
      userAgent: 'jest',
      payloadHash: 'a'.repeat(64),
      previousHash: null,
      eventHash: 'b'.repeat(64),
      chainSequence: '1',
      result: 'accepted',
      timestamp: new Date('2026-06-03T12:00:00.000Z'),
      createdAt: new Date('2026-06-03T12:00:00.000Z'),
      ...overrides,
    } as LedgerEventEntity;
  }

  it('returns events scoped to a tenant', (done) => {
    repository.find.mockResolvedValue([savedEntity()]);

    service.findAll(tenantId).subscribe({
      next: (result) => {
        expect(result).toHaveLength(1);
        expect(repository.find).toHaveBeenCalledWith({
          where: { tenantId },
          order: { createdAt: 'ASC' },
        });
        done();
      },
      error: done,
    });
  });

  it('returns one event scoped to a tenant', (done) => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    repository.findOne.mockResolvedValue(savedEntity({ id }));

    service.findOne(id, tenantId).subscribe({
      next: (result) => {
        expect(result.id).toBe(id);
        expect(repository.findOne).toHaveBeenCalledWith({ where: { id, tenantId } });
        done();
      },
      error: done,
    });
  });

  it('rejects invalid event ids before querying the database', (done) => {
    service.findOne('not-a-uuid', tenantId).subscribe({
      next: () => done(new Error('Expected invalid ledger event id to fail')),
      error: (error) => {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(repository.findOne).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('returns not found for a missing tenant-scoped event', (done) => {
    repository.findOne.mockResolvedValue(null);

    service.findOne('550e8400-e29b-41d4-a716-446655440000', tenantId).subscribe({
      next: () => done(new Error('Expected missing ledger event to fail')),
      error: (error) => {
        expect(error).toBeInstanceOf(NotFoundException);
        done();
      },
    });
  });

  it('appends an event with server-controlled audit metadata and chain fields', (done) => {
    transactionalRepository.findOne.mockResolvedValue(null);
    transactionalRepository.save.mockImplementation(async (entity) => ({
      ...entity,
      createdAt: new Date('2026-06-03T12:00:00.000Z'),
    }) as LedgerEventEntity);

    service
      .appendEvent(
        {
          type: 'LEDGER_EVENT',
          subjectType: 'order',
          subjectId: 'order-1',
          payload: { b: 2, a: 1 },
        },
        actor,
        tenantId,
        { sourceIp: '127.0.0.1', userAgent: 'jest', correlationId: 'corr-1' },
      )
      .subscribe({
        next: (result) => {
          expect(result.actorId).toBe('test-user');
          expect(result.metadata.tenantId).toBe(tenantId);
          expect(result.metadata.chainSequence).toBe(1);
          expect(result.metadata.eventHash).toHaveLength(64);
          expect(result.metadata.payloadHash).toHaveLength(64);
          expect(result.metadata.userAgent).toBe('jest');
          expect(result.metadata.sourceIp).toBe('127.0.0.1');
          expect(notificationsGateway.emitLedgerEvent).toHaveBeenCalledWith(
            result,
          );
          expect(metricsService.recordLedgerEventCreated).toHaveBeenCalledWith({
            eventType: 'LEDGER_EVENT',
            subjectType: 'order',
            result: 'accepted',
          });
          done();
        },
        error: done,
      });
  });

  it('links a new event to the previous tenant event', (done) => {
    transactionalRepository.findOne.mockResolvedValue(
      savedEntity({ eventHash: 'c'.repeat(64), chainSequence: '7' }),
    );
    transactionalRepository.save.mockImplementation(async (entity) => ({
      ...entity,
      createdAt: new Date('2026-06-03T12:00:00.000Z'),
    }) as LedgerEventEntity);

    service
      .appendEvent(
        {
          type: 'LEDGER_EVENT',
          subjectType: 'order',
          subjectId: 'order-2',
          payload: { action: 'updated' },
        },
        actor,
        tenantId,
      )
      .subscribe({
        next: (result) => {
          expect(result.metadata.previousHash).toBe('c'.repeat(64));
          expect(result.metadata.chainSequence).toBe(8);
          done();
        },
        error: done,
      });
  });

  it('verifies a valid tenant chain', (done) => {
    const first = savedEntity({ chainSequence: '1', previousHash: null });
    first.eventHash = computeEventHash(first);
    const second = savedEntity({
      id: '550e8400-e29b-41d4-a716-446655440001',
      subjectId: 'order-2',
      chainSequence: '2',
      previousHash: first.eventHash,
    });
    second.eventHash = computeEventHash(second);
    repository.find.mockResolvedValue([first, second]);

    service.verifyChain(tenantId).subscribe({
      next: (result) => {
        expect(result.valid).toBe(true);
        expect(result.checkedEvents).toBe(2);
        expect(result.headHash).toBe(second.eventHash);
        expect(result.failures).toEqual([]);
        done();
      },
      error: done,
    });
  });

  it('reports chain verification failures', (done) => {
    repository.find.mockResolvedValue([
      savedEntity({
        chainSequence: '2',
        previousHash: 'bad-previous-hash',
        eventHash: 'bad-event-hash',
      }),
    ]);

    service.verifyChain(tenantId).subscribe({
      next: (result) => {
        expect(result.valid).toBe(false);
        expect(result.failures.map((failure) => failure.reason)).toEqual([
          'Expected chain sequence 1',
          'Previous hash does not match prior event hash',
          'Event hash does not match canonical event data',
        ]);
        done();
      },
      error: done,
    });
  });

  it('rejects client-supplied audit metadata', (done) => {
    service
      .appendEvent(
        {
          type: 'LEDGER_EVENT',
          actorId: 'spoofed',
          subjectType: 'order',
          subjectId: 'order-1',
          payload: { action: 'created' },
          metadata: { tenantId: 'spoofed' },
        },
        actor,
        tenantId,
      )
      .subscribe({
        next: () => done(new Error('Expected client-supplied audit metadata to fail')),
        error: (error) => {
          expect(error).toBeInstanceOf(BadRequestException);
          done();
        },
      });
  });
});
