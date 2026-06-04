import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type {
  AppendLedgerEventDto,
  LedgerChainVerificationResponse,
  LedgerEventResponse,
} from '@true-north-ledger/ledger-contracts';
import { AppendLedgerEventDtoSchema } from '@true-north-ledger/ledger-contracts';
import { LedgerEventsService } from './ledger-events.service';
import type { AuthenticatedLedgerActor } from './ledger-events.service';
import { ZodValidationPipe } from './ledger-events.pipe';
import { TenantGuard } from '../auth/tenant.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { RateLimit } from '../auth/rate-limit.decorator';

interface AuthenticatedLedgerRequest {
  user: AuthenticatedLedgerActor & { permissions?: string[] };
  tenantId: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const ledgerEventResponseSchema = {
  type: 'object',
  required: ['id', 'type', 'actorType', 'actorId', 'subjectType', 'subjectId', 'payload', 'metadata', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: ['LEDGER_EVENT', 'DEVICE_LEDGER_EVENT'] },
    actorType: { type: 'string', enum: ['user', 'device', 'system', 'admin', 'service'] },
    actorId: { type: 'string' },
    subjectType: { type: 'string' },
    subjectId: { type: 'string' },
    deviceId: { type: 'string' },
    deviceType: { type: 'string' },
    payload: { type: 'object', additionalProperties: true },
    metadata: {
      type: 'object',
      required: ['tenantId', 'requestId', 'payloadHash', 'eventHash', 'chainSequence', 'result', 'timestamp'],
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        requestId: { type: 'string' },
        correlationId: { type: 'string' },
        sourceIp: { type: 'string' },
        userAgent: { type: 'string' },
        payloadHash: { type: 'string' },
        previousHash: { type: 'string' },
        eventHash: { type: 'string' },
        chainSequence: { type: 'integer', minimum: 1 },
        result: { type: 'string', enum: ['accepted', 'rejected', 'failed'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const apiErrorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    error: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
    requestId: { type: 'string' },
    correlationId: { type: 'string' },
  },
};

@ApiTags('Ledger Events')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid credentials.', schema: apiErrorResponseSchema })
@ApiForbiddenResponse({ description: 'Tenant or permission check failed.', schema: apiErrorResponseSchema })
@Controller('v1/ledger/events')
@UseGuards(TokenAuthGuard, TenantGuard, RateLimitGuard, PermissionsGuard)
export class LedgerEventsController {
  constructor(private readonly ledgerEventsService: LedgerEventsService) {}

  @Get()
  @RequirePermissions('ledger.read')
  @ApiOperation({ summary: 'List ledger events for the authenticated tenant' })
  @ApiOkResponse({
    description: 'Tenant-scoped ledger events ordered by creation time.',
    schema: { type: 'array', items: ledgerEventResponseSchema },
  })
  findAll(@Req() req: AuthenticatedLedgerRequest): Observable<LedgerEventResponse[]> {
    return this.ledgerEventsService.findAll(req.tenantId);
  }

  @Get('chain/verify')
  @RequirePermissions('ledger.audit')
  @ApiOperation({ summary: 'Verify the authenticated tenant ledger hash chain' })
  @ApiOkResponse({
    description: 'Ledger chain verification result.',
    schema: {
      type: 'object',
      required: ['tenantId', 'valid', 'checkedEvents', 'failures'],
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        valid: { type: 'boolean' },
        checkedEvents: { type: 'integer', minimum: 0 },
        headHash: { type: 'string' },
        failures: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventId: { type: 'string', format: 'uuid' },
              chainSequence: { type: 'integer', minimum: 1 },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  })
  verifyChain(@Req() req: AuthenticatedLedgerRequest): Observable<LedgerChainVerificationResponse> {
    return this.ledgerEventsService.verifyChain(req.tenantId);
  }

  @Get(':id')
  @RequirePermissions('ledger.read')
  @ApiOperation({ summary: 'Get one tenant-scoped ledger event by id' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Ledger event id.' })
  @ApiOkResponse({ description: 'Ledger event found.', schema: ledgerEventResponseSchema })
  @ApiBadRequestResponse({ description: 'Invalid event id.', schema: apiErrorResponseSchema })
  @ApiNotFoundResponse({ description: 'Event not found for tenant.', schema: apiErrorResponseSchema })
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedLedgerRequest,
  ): Observable<LedgerEventResponse> {
    return this.ledgerEventsService.findOne(id, req.tenantId);
  }

  @Post()
  @RequirePermissions('ledger.write')
  @ApiOperation({ summary: 'Append a server-audited ledger event' })
  @ApiBody({
    description: 'Business data only. Audit metadata is derived by the server.',
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['type', 'subjectType', 'subjectId', 'payload'],
          properties: {
            type: { type: 'string', enum: ['LEDGER_EVENT'] },
            subjectType: { type: 'string', minLength: 1 },
            subjectId: { type: 'string', minLength: 1 },
            payload: { type: 'object', additionalProperties: true },
          },
        },
        {
          type: 'object',
          required: ['type', 'subjectType', 'subjectId', 'deviceId', 'deviceType', 'payload'],
          properties: {
            type: { type: 'string', enum: ['DEVICE_LEDGER_EVENT'] },
            subjectType: { type: 'string', minLength: 1 },
            subjectId: { type: 'string', minLength: 1 },
            deviceId: { type: 'string', minLength: 1 },
            deviceType: { type: 'string', minLength: 1 },
            payload: { type: 'object', additionalProperties: true },
          },
        },
      ],
    },
  })
  @ApiCreatedResponse({ description: 'Ledger event appended.', schema: ledgerEventResponseSchema })
  @ApiBadRequestResponse({ description: 'Invalid append payload.', schema: apiErrorResponseSchema })
  appendEvent(
    @Body(new ZodValidationPipe(AppendLedgerEventDtoSchema))
    payload: AppendLedgerEventDto,
    @Req() req: AuthenticatedLedgerRequest,
  ): Observable<LedgerEventResponse> {
    return this.ledgerEventsService.appendEvent(payload, req.user, req.tenantId, {
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    });
  }

  @Post('append-override')
  @RequirePermissions('ledger.write')
  @RateLimit({ maxRequests: 2, windowMs: 1000 })
  @ApiOperation({ summary: 'Append a server-audited ledger event with endpoint-specific rate limit' })
  @ApiBody({
    description: 'Business data only. Audit metadata is derived by the server.',
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['type', 'subjectType', 'subjectId', 'payload'],
          properties: {
            type: { type: 'string', enum: ['LEDGER_EVENT'] },
            subjectType: { type: 'string', minLength: 1 },
            subjectId: { type: 'string', minLength: 1 },
            payload: { type: 'object', additionalProperties: true },
          },
        },
        {
          type: 'object',
          required: ['type', 'subjectType', 'subjectId', 'deviceId', 'deviceType', 'payload'],
          properties: {
            type: { type: 'string', enum: ['DEVICE_LEDGER_EVENT'] },
            subjectType: { type: 'string', minLength: 1 },
            subjectId: { type: 'string', minLength: 1 },
            deviceId: { type: 'string', minLength: 1 },
            deviceType: { type: 'string', minLength: 1 },
            payload: { type: 'object', additionalProperties: true },
          },
        },
      ],
    },
  })
  @ApiCreatedResponse({ description: 'Ledger event appended.', schema: ledgerEventResponseSchema })
  @ApiBadRequestResponse({ description: 'Invalid append payload.', schema: apiErrorResponseSchema })
  appendEventWithOverride(
    @Body(new ZodValidationPipe(AppendLedgerEventDtoSchema))
    payload: AppendLedgerEventDto,
    @Req() req: AuthenticatedLedgerRequest,
  ): Observable<LedgerEventResponse> {
    return this.ledgerEventsService.appendEvent(payload, req.user, req.tenantId, {
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    });
  }
}
