import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  DEVICE_BATCH_PAYLOAD_MAX_BYTES,
  DEVICE_EVENT_PAYLOAD_MAX_BYTES,
  DeviceBatchEventIngestResponseExample,
  DeviceEventRequestSchema,
  DeviceHardwareExamples,
  DeviceBatchEventRequestExample,
  DeviceBatchEventRequestSchema,
} from '@true-north-ledger/device-contracts';
import type {
  DeviceBatchEventIngestResponse,
  DeviceBatchEventRequest,
  DeviceEventIngestResponse,
  DeviceEventRequest,
} from '@true-north-ledger/device-contracts';
import { Observable } from 'rxjs';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import type { DeviceActor } from './devices.service';
import { DeviceAuthGuard } from './device-auth.guard';
import { DevicesService } from './devices.service';

interface DeviceAuthenticatedRequest {
  user: DeviceActor;
  tenantId: string;
  deviceId: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Device Events')
@Controller('v1/device-events')
export class DeviceEventsController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @UseGuards(DeviceAuthGuard, RateLimitGuard)
  @RateLimit({ maxRequests: 120, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest one device event and append a device-scoped ledger event' })
  @ApiHeader({ name: 'X-Device-Key', required: true, description: 'Raw device API key returned at registration.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['eventType', 'payload'],
      example: DeviceHardwareExamples.scanner.event,
      properties: {
        eventType: { type: 'string', example: 'SCAN_RECEIVED' },
        timestamp: { type: 'string', format: 'date-time' },
        payload: {
          type: 'object',
          additionalProperties: true,
          description: `JSON payload, maximum ${DEVICE_EVENT_PAYLOAD_MAX_BYTES} bytes.`,
        },
        nonce: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Device event recorded and ledger event id returned.',
    schema: {
      type: 'object',
      required: ['eventId', 'serverTimestamp'],
      properties: {
        eventId: { type: 'string', format: 'uuid' },
        serverTimestamp: { type: 'string', format: 'date-time' },
        nonce: { type: 'string', description: 'Accepted client nonce, echoed when provided.' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid event payload, including payload size limit violations.' })
  @ApiConflictResponse({ description: 'Duplicate nonce rejected as replay protection.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, revoked, or suspended device key.' })
  ingest(
    @Body() body: DeviceEventRequest,
    @Req() req: DeviceAuthenticatedRequest,
  ): Observable<DeviceEventIngestResponse> {
    const parsed = DeviceEventRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.devicesService.ingestDeviceEvent(req.user, parsed.data, this.requestContext(req));
  }

  @Post('batch')
  @UseGuards(DeviceAuthGuard, RateLimitGuard)
  @RateLimit({ maxRequests: 60, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a batch of device events and return per-item results' })
  @ApiHeader({ name: 'X-Device-Key', required: true, description: 'Raw device API key returned at registration.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['events'],
      example: DeviceBatchEventRequestExample,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['eventType', 'payload'],
            properties: {
              eventType: { type: 'string', example: 'SCAN_RECEIVED' },
              timestamp: { type: 'string', format: 'date-time' },
              payload: {
                type: 'object',
                additionalProperties: true,
                description: `JSON payload, maximum ${DEVICE_EVENT_PAYLOAD_MAX_BYTES} bytes per event and ${DEVICE_BATCH_PAYLOAD_MAX_BYTES} bytes per batch.`,
              },
              nonce: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Batch event ingestion completed with per-event result details.',
    schema: {
      type: 'object',
      example: DeviceBatchEventIngestResponseExample,
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['index', 'success'],
            properties: {
              index: { type: 'number' },
              success: { type: 'boolean' },
              eventId: { type: 'string', format: 'uuid' },
              serverTimestamp: { type: 'string', format: 'date-time' },
              nonce: { type: 'string', description: 'Accepted client nonce, echoed when provided.' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  ingestBatch(
    @Body() body: DeviceBatchEventRequest,
    @Req() req: DeviceAuthenticatedRequest,
  ): Observable<DeviceBatchEventIngestResponse> {
    const parsed = DeviceBatchEventRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.devicesService.ingestDeviceEventsBatch(req.user, parsed.data, this.requestContext(req));
  }

  private requestContext(req: DeviceAuthenticatedRequest) {
    return {
      sourceIp: req.ip,
      userAgent: req.headers?.['user-agent'],
      correlationId: req.headers?.['x-correlation-id'],
    };
  }
}
