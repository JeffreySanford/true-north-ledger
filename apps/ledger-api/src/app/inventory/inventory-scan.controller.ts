import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  InventoryBatchScanRequestSchema,
  InventoryBatchScanResponse,
  InventoryItem,
  InventoryScanRequestSchema,
  InventoryScanTypeSchema,
} from '@true-north-ledger/inventory-contracts';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import type { AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';
import { InventoryScanAuthGuard } from './inventory-scan-auth.guard';
import { InventoryService } from './inventory.service';

interface ScanAuthenticatedRequest {
  user: AuthenticatedLedgerActor & {
    permissions?: string[];
    deviceId?: string;
    deviceType?: string;
  };
  tenantId: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Inventory')
@Controller('v1/inventory')
export class InventoryScanController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('scan/batch')
  @UseGuards(InventoryScanAuthGuard, RateLimitGuard)
  @RateLimit({ maxRequests: 30, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Scan up to 100 tenant inventory items and return per-item results' })
  @ApiSecurity('device-key')
  @ApiHeader({ name: 'X-Device-Key', required: false, description: 'Device API key; bearer auth may also be used.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['value', 'scanType'],
            properties: {
              value: { type: 'string', example: 'SKU-100' },
              scanType: { type: 'string', enum: InventoryScanTypeSchema.options },
              locationId: { type: 'string', example: 'AUSTIN-A1' },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Batch inventory scan completed with per-item results.' })
  @ApiBadRequestResponse({ description: 'Invalid batch scan payload.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token or device key.' })
  scanBatch(@Body() body: unknown, @Req() req: ScanAuthenticatedRequest): Observable<InventoryBatchScanResponse> {
    const parsed = InventoryBatchScanRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.scanItemsBatch(parsed.data, req.user, this.requestContext(req));
  }

  @Post('scan')
  @UseGuards(InventoryScanAuthGuard, RateLimitGuard)
  @RateLimit({ maxRequests: 120, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Scan tenant inventory by SKU or serial number and record provenance' })
  @ApiSecurity('device-key')
  @ApiHeader({ name: 'X-Device-Key', required: false, description: 'Device API key; bearer auth may also be used.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['value', 'scanType'],
      properties: {
        value: { type: 'string', example: 'SKU-100' },
        scanType: { type: 'string', enum: InventoryScanTypeSchema.options },
        locationId: { type: 'string', example: 'AUSTIN-A1' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory scan accepted and item details returned.' })
  @ApiBadRequestResponse({ description: 'Invalid scan payload.' })
  @ApiConflictResponse({ description: 'Scan location does not match the inventory item location.' })
  @ApiNotFoundResponse({ description: 'No tenant inventory matches the SKU or serial number.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token or device key.' })
  scan(@Body() body: unknown, @Req() req: ScanAuthenticatedRequest): Observable<InventoryItem> {
    const parsed = InventoryScanRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.scanItem(parsed.data, req.user, this.requestContext(req));
  }

  private requestContext(req: ScanAuthenticatedRequest) {
    return {
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    };
  }
}
