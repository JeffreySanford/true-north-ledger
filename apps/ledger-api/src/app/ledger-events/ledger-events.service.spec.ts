import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { LedgerEventsService } from './ledger-events.service';
import { LedgerEventEntity } from './ledger-event.entity';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';

describe('LedgerEventsService', () => {
  let service: LedgerEventsService;
  let repository: jest.Mocked<Repository<LedgerEventEntity>>;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerEventsService,
        {
          provide: getRepositoryToken(LedgerEventEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<LedgerEventsService>(LedgerEventsService);
    repository = module.get(getRepositoryToken(LedgerEventEntity));
  });

  function makePayloadHash(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  it('should append a ledger event and return it', async () => {
    const payload = { action: 'create' };
    const dto = {
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'test',
      subjectId: 'subject-1',
      payload,
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'request-1',
        correlationId: undefined,
        sourceIp: undefined,
        userAgent: 'test-agent',
        payloadHash: makePayloadHash(payload),
        previousHash: undefined,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
    } as const;

    const savedEntity = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'LEDGER_EVENT' as const,
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'test',
      subjectId: 'subject-1',
      payload,
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-1',
      correlationId: undefined,
      sourceIp: undefined,
      userAgent: 'test-agent',
      payloadHash: makePayloadHash(payload),
      previousHash: undefined,
      result: 'accepted' as const,
      timestamp: new Date(),
      createdAt: new Date(),
    };

    repository.save.mockResolvedValue(savedEntity as LedgerEventEntity);

    const event = await firstValueFrom(service.appendEvent(dto));

    expect(event).toMatchObject({
      type: 'LEDGER_EVENT',
      actorId: 'test-user',
      subjectId: 'subject-1',
    });
    expect(event.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(event.createdAt).toBeDefined();
  });

  it('should reject an event with a mismatched payload hash', async () => {
    const payload = { action: 'create' };
    const dto = {
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'test',
      subjectId: 'subject-1',
      payload,
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'request-1',
        correlationId: undefined,
        sourceIp: undefined,
        userAgent: 'test-agent',
        payloadHash: 'invalid-hash',
        previousHash: undefined,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
    } as const;

    await expect(firstValueFrom(service.appendEvent(dto))).rejects.toThrow(
      'payloadHash mismatch for supplied payload'
    );
  });

  it('should return all events from database', async () => {
    const entities = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        type: 'LEDGER_EVENT' as const,
        actorType: 'user',
        actorId: 'test-user',
        subjectType: 'test',
        subjectId: 'subject-1',
        payload: { action: 'create' },
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'request-1',
        userAgent: 'test-agent',
        payloadHash: makePayloadHash({ action: 'create' }),
        result: 'accepted' as const,
        timestamp: new Date(),
        createdAt: new Date(),
      } as LedgerEventEntity,
    ];

    repository.find.mockResolvedValue(entities);

    const allEvents = await firstValueFrom(service.findAll());

    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].actorId).toBe('test-user');
    expect(repository.find).toHaveBeenCalledWith({ order: { createdAt: 'ASC' } });
  });

  it('should append a device ledger event with deviceId and deviceType', async () => {
    const payload = { temperature: 22.5, humidity: 45 };
    const dto = {
      type: 'DEVICE_LEDGER_EVENT',
      actorType: 'device',
      actorId: 'sensor-001',
      subjectType: 'measurement',
      subjectId: 'temp-reading-1',
      deviceId: 'sensor-001',
      deviceType: 'temperature-sensor',
      payload,
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'device-request-1',
        correlationId: undefined,
        sourceIp: undefined,
        userAgent: 'IoT-Agent/1.0',
        payloadHash: makePayloadHash(payload),
        previousHash: undefined,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
    } as const;

    const savedEntity = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      type: 'DEVICE_LEDGER_EVENT' as const,
      actorType: 'device',
      actorId: 'sensor-001',
      subjectType: 'measurement',
      subjectId: 'temp-reading-1',
      deviceId: 'sensor-001',
      deviceType: 'temperature-sensor',
      payload,
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'device-request-1',
      userAgent: 'IoT-Agent/1.0',
      payloadHash: makePayloadHash(payload),
      result: 'accepted' as const,
      timestamp: new Date(),
      createdAt: new Date(),
    } as LedgerEventEntity;

    repository.save.mockResolvedValue(savedEntity);

    const event = await firstValueFrom(service.appendEvent(dto));

    expect(event).toMatchObject({
      type: 'DEVICE_LEDGER_EVENT',
      deviceId: 'sensor-001',
      deviceType: 'temperature-sensor',
      actorId: 'sensor-001',
    });
    expect(event.id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });

  it('should find a specific event by id', async () => {
    const entity = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      type: 'LEDGER_EVENT' as const,
      actorType: 'user',
      actorId: 'user-1',
      subjectType: 'test',
      subjectId: 'subject-1',
      payload: { action: 'test' },
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'req-1',
      userAgent: 'test',
      payloadHash: makePayloadHash({ action: 'test' }),
      result: 'accepted' as const,
      timestamp: new Date(),
      createdAt: new Date(),
    } as LedgerEventEntity;

    repository.findOne.mockResolvedValue(entity);

    const found = await firstValueFrom(service.findOne('550e8400-e29b-41d4-a716-446655440003'));

    expect(found.id).toBe('550e8400-e29b-41d4-a716-446655440003');
    expect(found.actorId).toBe('user-1');
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '550e8400-e29b-41d4-a716-446655440003' } });
  });

  it('should throw error when event not found by id', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(firstValueFrom(service.findOne('non-existent-id'))).rejects.toThrow(
      'Ledger event non-existent-id not found'
    );
  });

  it('should reject invalid schema data', async () => {
    const invalidDto = {
      type: 'INVALID_TYPE',
      actorType: 'user',
      actorId: 'test',
      subjectType: 'test',
      subjectId: 'test',
      payload: {},
      metadata: {},
    };

    await expect(firstValueFrom(service.appendEvent(invalidDto))).rejects.toThrow();
  });

  it('should handle database errors gracefully on findAll', async () => {
    repository.find.mockRejectedValue(new Error('Database connection failed'));

    await expect(firstValueFrom(service.findAll())).rejects.toThrow('Database connection failed');
  });

  it('should handle database errors gracefully on save', async () => {
    const payload = { action: 'create' };
    const dto = {
      type: 'LEDGER_EVENT',
      actorType: 'user',
      actorId: 'test-user',
      subjectType: 'test',
      subjectId: 'subject-1',
      payload,
      metadata: {
        tenantId: '00000000-0000-0000-0000-000000000000',
        requestId: 'request-1',
        correlationId: undefined,
        sourceIp: undefined,
        userAgent: 'test-agent',
        payloadHash: makePayloadHash(payload),
        previousHash: undefined,
        result: 'accepted',
        timestamp: new Date().toISOString(),
      },
    } as const;

    repository.save.mockRejectedValue(new Error('Database write failed'));

    await expect(firstValueFrom(service.appendEvent(dto))).rejects.toThrow('Database write failed');
  });
});
