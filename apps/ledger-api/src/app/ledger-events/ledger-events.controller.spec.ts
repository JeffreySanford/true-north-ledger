import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { LedgerEventsController } from './ledger-events.controller';
import { LedgerEventsService } from './ledger-events.service';
import { LedgerEventEntity } from './ledger-event.entity';

describe('LedgerEventsController', () => {
  let controller: LedgerEventsController;
  let service: LedgerEventsService;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LedgerEventsController],
      providers: [
        LedgerEventsService,
        {
          provide: getRepositoryToken(LedgerEventEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    controller = module.get<LedgerEventsController>(LedgerEventsController);
    service = module.get<LedgerEventsService>(LedgerEventsService);
  });

  it('returns the full event list as observable', (done) => {
    jest.spyOn(service, 'findAll').mockReturnValue(of([]));
    controller.findAll().subscribe({
      next: (result) => {
        expect(result).toEqual([]);
        done();
      },
    });
  });

  it('returns a single event by id as observable', (done) => {
    const event = { id: 'event-1', type: 'LEDGER_EVENT' } as any;
    jest.spyOn(service, 'findOne').mockReturnValue(of(event));
    controller.findOne('event-1').subscribe({
      next: (result) => {
        expect(result).toBe(event);
        done();
      },
    });
  });

  it('should create a new event through POST endpoint', (done) => {
    const dto = {
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'user-1',
      subjectType: 'order',
      subjectId: 'order-123',
      payload: { action: 'created' },
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'req-1',
        userAgent: 'test',
        payloadHash: 'hash-123',
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
    } as any;

    const createdEvent = { ...dto, id: 'evt-1', createdAt: new Date().toISOString() };
    jest.spyOn(service, 'appendEvent').mockReturnValue(of(createdEvent));

    controller.appendEvent(dto).subscribe({
      next: (result) => {
        expect(result).toEqual(createdEvent);
        expect(service.appendEvent).toHaveBeenCalledWith(dto);
        done();
      },
    });
  });

  it('should propagate errors from service on findOne', (done) => {
    jest.spyOn(service, 'findOne').mockReturnValue(throwError(() => new Error('Event not found')));

    controller.findOne('bad-id').subscribe({
      error: (error) => {
        expect(error.message).toBe('Event not found');
        done();
      },
    });
  });

  it('should propagate errors from service on appendEvent', (done) => {
    const dto = { invalid: 'data' } as any;
    jest.spyOn(service, 'appendEvent').mockReturnValue(throwError(() => new Error('Validation failed')));

    controller.appendEvent(dto).subscribe({
      error: (error) => {
        expect(error.message).toBe('Validation failed');
        done();
      },
    });
  });
});
