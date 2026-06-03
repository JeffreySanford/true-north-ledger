import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import type { AppendLedgerEventDto, LedgerEventResponse } from '@true-north-ledger/ledger-contracts';
import { LedgerEventEntity } from './ledger-event.entity';
import { LedgerEventsController } from './ledger-events.controller';
import { LedgerEventsService } from './ledger-events.service';

describe('LedgerEventsController', () => {
  const request = {
    tenantId: '00000000-0000-0000-0000-000000000000',
    user: {
      userId: 'test-user',
      actorType: 'user',
      tenantId: '00000000-0000-0000-0000-000000000000',
      permissions: ['read', 'write'],
    },
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest',
      'x-correlation-id': 'corr-1',
    },
  };

  let controller: LedgerEventsController;
  let service: LedgerEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LedgerEventsController],
      providers: [
        LedgerEventsService,
        {
          provide: getRepositoryToken(LedgerEventEntity),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<LedgerEventsController>(LedgerEventsController);
    service = module.get<LedgerEventsService>(LedgerEventsService);
  });

  it('returns the tenant-scoped event list as an observable', (done) => {
    jest.spyOn(service, 'findAll').mockReturnValue(of([]));

    controller.findAll(request).subscribe({
      next: (result) => {
        expect(result).toEqual([]);
        expect(service.findAll).toHaveBeenCalledWith(request.tenantId);
        done();
      },
    });
  });

  it('returns a tenant-scoped single event as an observable', (done) => {
    const event = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'order',
      subjectId: 'order-123',
      payload: { action: 'created' },
      metadata: {
        tenantId: request.tenantId,
        requestId: 'request-1',
        payloadHash: 'a'.repeat(64),
        eventHash: 'b'.repeat(64),
        chainSequence: 1,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    } satisfies LedgerEventResponse;
    jest.spyOn(service, 'findOne').mockReturnValue(of(event));

    controller.findOne(event.id, request).subscribe({
      next: (result) => {
        expect(result).toBe(event);
        expect(service.findOne).toHaveBeenCalledWith(event.id, request.tenantId);
        done();
      },
    });
  });

  it('creates a new event from authenticated request context', (done) => {
    const dto = {
      type: 'LEDGER_EVENT' as const,
      subjectType: 'order',
      subjectId: 'order-123',
      payload: { action: 'created' },
    };
    const createdEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT',
      actorType: request.user.actorType,
      actorId: request.user.userId,
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      payload: dto.payload,
      metadata: {
        tenantId: request.tenantId,
        requestId: 'request-1',
        payloadHash: 'a'.repeat(64),
        eventHash: 'b'.repeat(64),
        chainSequence: 1,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    } satisfies LedgerEventResponse;
    jest.spyOn(service, 'appendEvent').mockReturnValue(of(createdEvent));

    controller.appendEvent(dto, request).subscribe({
      next: (result) => {
        expect(result).toEqual(createdEvent);
        expect(service.appendEvent).toHaveBeenCalledWith(dto, request.user, request.tenantId, {
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          correlationId: request.headers['x-correlation-id'],
        });
        done();
      },
    });
  });

  it('verifies the tenant-scoped ledger chain', (done) => {
    const verification = {
      tenantId: request.tenantId,
      valid: true,
      checkedEvents: 0,
      failures: [],
    };
    jest.spyOn(service, 'verifyChain').mockReturnValue(of(verification));

    controller.verifyChain(request).subscribe({
      next: (result) => {
        expect(result).toEqual(verification);
        expect(service.verifyChain).toHaveBeenCalledWith(request.tenantId);
        done();
      },
    });
  });

  it('propagates errors from service on findOne', (done) => {
    jest.spyOn(service, 'findOne').mockReturnValue(throwError(() => new Error('Event not found')));

    controller.findOne('bad-id', request).subscribe({
      error: (error) => {
        expect(error.message).toBe('Event not found');
        done();
      },
    });
  });

  it('propagates errors from service on appendEvent', (done) => {
    const dto = { invalid: 'data' } as unknown as AppendLedgerEventDto;
    jest.spyOn(service, 'appendEvent').mockReturnValue(throwError(() => new Error('Validation failed')));

    controller.appendEvent(dto, request).subscribe({
      error: (error) => {
        expect(error.message).toBe('Validation failed');
        done();
      },
    });
  });
});
