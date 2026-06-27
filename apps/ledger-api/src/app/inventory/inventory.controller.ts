import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  CreateInventoryItemRequestExample,
  CreateInventoryItemRequestSchema,
  InventoryItem,
  InventoryItemExample,
  InventoryAlertListResponse,
  InventoryAlertSeveritySchema,
  InventoryAlertTypeSchema,
  InventoryAnomalyListResponse,
  InventoryAnomalyListRequestSchema,
  InventoryAnomalySeveritySchema,
  InventoryAnomalyTypeSchema,
  InventoryBulkMoveRequestSchema,
  InventoryBulkMoveResponse,
  InventoryExpiredReservationReleaseResponse,
  InventoryImportRequestSchema,
  InventoryImportResponse,
  InventoryListResponse,
  InventoryMoveRequestSchema,
  InventoryProvenanceResponse,
  InventoryQuantityAdjustmentRequestSchema,
  InventoryReservationReleaseRequestSchema,
  InventoryReservationRequestSchema,
  InventoryRemovalRequestSchema,
  InventoryStatusChangeRequestSchema,
  InventoryStatusSchema,
} from '@true-north-ledger/inventory-contracts';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import type {
  AuthenticatedLedgerActor,
  LedgerRequestContext,
} from '../ledger-events/ledger-events.service';
import { InventoryService } from './inventory.service';

interface AuthenticatedRequest {
  user: AuthenticatedLedgerActor & { permissions?: string[] };
  tenantId: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Inventory')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@Controller('v1/inventory')
@UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RequirePermissions('inventory.write')
  @RateLimit({ maxRequests: 30, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a tenant-scoped inventory item and provenance event' })
  @ApiBody({ schema: { example: CreateInventoryItemRequestExample } })
  @ApiCreatedResponse({ schema: { example: InventoryItemExample } })
  @ApiBadRequestResponse({ description: 'Inventory payload validation failed.' })
  @ApiConflictResponse({ description: 'SKU already exists for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.write permission.' })
  @ApiTooManyRequestsResponse({ description: 'Inventory addition rate limit exceeded.' })
  add(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = CreateInventoryItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.inventoryService.addItem(parsed.data, req.user, this.requestContext(req));
  }

  @Get()
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List tenant-scoped inventory with filters and pagination' })
  @ApiQuery({ name: 'locationId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: InventoryStatusSchema.options })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['quantity', 'lastScannedAt', 'createdAt'] })
  @ApiQuery({ name: 'sortDirection', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ description: 'Tenant-scoped inventory list.' })
  @ApiBadRequestResponse({ description: 'Invalid inventory list filter.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.read permission.' })
  list(
    @Req() req: AuthenticatedRequest,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ): Observable<InventoryListResponse> {
    return this.inventoryService.listItems(req.tenantId, {
      locationId,
      status: this.parseStatus(status),
      query,
      page: this.parsePositiveInteger(page, 1, 10_000),
      pageSize: this.parsePositiveInteger(pageSize, 25, 100),
      sortBy: this.parseSortBy(sortBy),
      sortDirection: this.parseSortDirection(sortDirection),
    });
  }

  @Post('import')
  @UseGuards(RateLimitGuard)
  @RequirePermissions('inventory.write')
  @RateLimit({ maxRequests: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import multiple inventory items and return per-item results' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'object', example: CreateInventoryItemRequestExample },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory import completed with per-item results.' })
  @ApiBadRequestResponse({ description: 'Import request validation failed.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.write permission.' })
  @ApiTooManyRequestsResponse({ description: 'Inventory import rate limit exceeded.' })
  importBatch(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryImportResponse> {
    const parsed = InventoryImportRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.importItemsBatch(parsed.data, req.user, this.requestContext(req));
  }

  @Get('anomalies')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List computed tenant-scoped inventory anomalies' })
  @ApiQuery({ name: 'type', required: false, enum: InventoryAnomalyTypeSchema.options })
  @ApiQuery({ name: 'severity', required: false, enum: InventoryAnomalySeveritySchema.options })
  @ApiQuery({ name: 'detectedFrom', required: false, type: String, description: 'Inclusive detection date filter (YYYY-MM-DD).' })
  @ApiQuery({ name: 'detectedTo', required: false, type: String, description: 'Inclusive detection date filter (YYYY-MM-DD).' })
  @ApiOkResponse({ description: 'Open inventory anomalies.' })
  @ApiBadRequestResponse({ description: 'Invalid anomaly filter.' })
  anomalies(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('detectedFrom') detectedFrom?: string,
    @Query('detectedTo') detectedTo?: string,
  ): Observable<InventoryAnomalyListResponse> {
    const parsed = InventoryAnomalyListRequestSchema.safeParse({
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(detectedFrom ? { detectedFrom } : {}),
      ...(detectedTo ? { detectedTo } : {}),
    });
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.listAnomalies(req.tenantId, {
      type: parsed.data.type,
      severity: parsed.data.severity,
      detectedFrom: parsed.data.detectedFrom,
      detectedTo: parsed.data.detectedTo,
    });
  }

  @Post('anomalies/detect')
  @RequirePermissions('inventory.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect inventory anomalies and append ledger events' })
  @ApiOkResponse({ description: 'Detected anomalies and ledger events created.' })
  detectAnomalies(@Req() req: AuthenticatedRequest): Observable<InventoryAnomalyListResponse> {
    return this.inventoryService.detectAnomalies(req.user, this.requestContext(req));
  }

  @Get('alerts')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List computed tenant-scoped inventory alerts' })
  @ApiQuery({ name: 'type', required: false, enum: InventoryAlertTypeSchema.options })
  @ApiQuery({ name: 'severity', required: false, enum: InventoryAlertSeveritySchema.options })
  @ApiOkResponse({ description: 'Current inventory alerts.' })
  alerts(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
  ): Observable<InventoryAlertListResponse> {
    const parsedType = type ? InventoryAlertTypeSchema.safeParse(type) : undefined;
    const parsedSeverity = severity ? InventoryAlertSeveritySchema.safeParse(severity) : undefined;
    if (parsedType && !parsedType.success) throw new BadRequestException('Invalid alert type');
    if (parsedSeverity && !parsedSeverity.success) throw new BadRequestException('Invalid alert severity');
    return this.inventoryService.listAlerts(req.tenantId, {
      type: parsedType?.data,
      severity: parsedSeverity?.data,
    });
  }

  @Post('alerts/generate')
  @RequirePermissions('inventory.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate current inventory alerts and append ledger events' })
  @ApiOkResponse({ description: 'Generated alerts and ledger events created.' })
  generateAlerts(@Req() req: AuthenticatedRequest): Observable<InventoryAlertListResponse> {
    return this.inventoryService.generateAlerts(req.user, this.requestContext(req));
  }

  @Get('sku/:sku')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'Get one tenant-scoped inventory item by SKU' })
  @ApiParam({ name: 'sku', description: 'Tenant-scoped inventory SKU.' })
  @ApiOkResponse({ schema: { example: InventoryItemExample } })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.read permission.' })
  getBySku(
    @Param('sku') sku: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    return this.inventoryService.getItemBySku(sku, req.tenantId);
  }

  @Get(':id/provenance')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'Get the complete tenant-scoped inventory ledger provenance timeline' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiOkResponse({ description: 'Inventory item and chronological provenance events.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.read permission.' })
  provenance(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryProvenanceResponse> {
    return this.inventoryService.getProvenance(id, req.tenantId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'Get one tenant-scoped inventory item by ID' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiQuery({ name: 'includeProvenance', required: false, type: Boolean, description: 'Return the item with its provenance timeline when true.' })
  @ApiOkResponse({ schema: { example: InventoryItemExample } })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.read permission.' })
  getById(
    @Param('id') id: string,
    @Query('includeProvenance') includeProvenance: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem | InventoryProvenanceResponse> {
    if (includeProvenance === 'true') {
      return this.inventoryService.getItemWithProvenance(id, req.tenantId);
    }
    return this.inventoryService.getItem(id, req.tenantId);
  }

  @Patch(':id/reserve')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Reserve available inventory and optionally link it to an order' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['quantity'],
      properties: {
        quantity: { type: 'number', minimum: 1, example: 2 },
        orderId: { type: 'string', format: 'uuid' },
        reservationExpiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory reserved.' })
  @ApiBadRequestResponse({ description: 'Reservation quantity exceeds available quantity.' })
  @ApiConflictResponse({ description: 'Inventory cannot be reserved.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  reserve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryReservationRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.reserveItem(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Patch(':id/release')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Release an active inventory reservation' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Order cancelled before fulfillment' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory reservation released.' })
  @ApiConflictResponse({ description: 'Inventory does not have an active reservation.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  release(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryReservationReleaseRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.releaseReservation(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Post('reservations/release-expired')
  @RequirePermissions('inventory.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release expired inventory reservations and record provenance' })
  @ApiOkResponse({ description: 'Expired reservations released.' })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.write permission.' })
  releaseExpiredReservations(@Req() req: AuthenticatedRequest): Observable<InventoryExpiredReservationReleaseResponse> {
    return this.inventoryService.releaseExpiredReservations(req.tenantId, req.user, this.requestContext(req));
  }

  @Patch(':id/move')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Move inventory to a new location and record provenance' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['locationId'],
      properties: {
        locationId: { type: 'string', example: 'AUSTIN-B2' },
        reason: { type: 'string', example: 'Cycle count relocation' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory moved.' })
  @ApiBadRequestResponse({ description: 'Move request validation failed.' })
  @ApiConflictResponse({ description: 'Inventory cannot be moved.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  move(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryMoveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.moveItem(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Post('move/batch')
  @RequirePermissions('inventory.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move multiple inventory items and return per-item results' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['moves'],
      properties: {
        moves: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['id', 'locationId'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              locationId: { type: 'string', example: 'AUSTIN-B2' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Bulk inventory movement completed with per-item results.' })
  @ApiBadRequestResponse({ description: 'Bulk move request validation failed.' })
  bulkMove(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryBulkMoveResponse> {
    const parsed = InventoryBulkMoveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.moveItemsBatch(req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Patch(':id/quantity')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Adjust inventory quantity and record provenance' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['quantity'],
      properties: {
        quantity: { type: 'number', example: 25 },
        reason: { type: 'string', example: 'Cycle count correction' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory quantity adjusted.' })
  @ApiBadRequestResponse({ description: 'Quantity adjustment request validation failed.' })
  @ApiConflictResponse({ description: 'Inventory quantity cannot be adjusted.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  adjustQuantity(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryQuantityAdjustmentRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.adjustQuantity(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Patch(':id/status')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Change active inventory status and record provenance' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: InventoryStatusSchema.options },
        reason: { type: 'string', example: 'Quality hold' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory status changed.' })
  @ApiBadRequestResponse({ description: 'Status change request validation failed.' })
  @ApiConflictResponse({ description: 'Inventory status cannot be changed through this endpoint.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  changeStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryStatusChangeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.changeStatus(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Delete(':id')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Soft-remove inventory while preserving its audit trail' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Inventory item ID.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Damaged item removed from active stock' },
      },
    },
  })
  @ApiOkResponse({ description: 'Inventory soft-removed.' })
  @ApiBadRequestResponse({ description: 'Removal reason is required.' })
  @ApiConflictResponse({ description: 'Inventory cannot be removed.' })
  @ApiNotFoundResponse({ description: 'Inventory item not found for tenant.' })
  remove(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryRemovalRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.removeItem(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  private parseStatus(value?: string) {
    if (!value) return undefined;
    const parsed = InventoryStatusSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid inventory status');
    return parsed.data;
  }

  private parsePositiveInteger(value: string | undefined, fallback: number, max: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw new BadRequestException(`Value must be an integer between 1 and ${max}`);
    }
    return parsed;
  }

  private parseSortBy(value?: string): 'quantity' | 'lastScannedAt' | 'createdAt' {
    if (!value) return 'createdAt';
    if (value !== 'quantity' && value !== 'lastScannedAt' && value !== 'createdAt') {
      throw new BadRequestException('Invalid inventory sort field');
    }
    return value;
  }

  private parseSortDirection(value?: string): 'asc' | 'desc' {
    if (!value) return 'desc';
    if (value !== 'asc' && value !== 'desc') {
      throw new BadRequestException('Invalid sort direction');
    }
    return value;
  }

  private requestContext(req: AuthenticatedRequest): LedgerRequestContext {
    return {
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    };
  }
}
