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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
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
  InventoryAnomalySeveritySchema,
  InventoryAnomalyTypeSchema,
  InventoryListResponse,
  InventoryMoveRequestSchema,
  InventoryProvenanceResponse,
  InventoryReservationReleaseRequestSchema,
  InventoryReservationRequestSchema,
  InventoryRemovalRequestSchema,
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

  @Get('anomalies')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List computed tenant-scoped inventory anomalies' })
  @ApiQuery({ name: 'type', required: false, enum: InventoryAnomalyTypeSchema.options })
  @ApiQuery({ name: 'severity', required: false, enum: InventoryAnomalySeveritySchema.options })
  @ApiOkResponse({ description: 'Open inventory anomalies.' })
  anomalies(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
  ): Observable<InventoryAnomalyListResponse> {
    const parsedType = type ? InventoryAnomalyTypeSchema.safeParse(type) : undefined;
    const parsedSeverity = severity ? InventoryAnomalySeveritySchema.safeParse(severity) : undefined;
    if (parsedType && !parsedType.success) throw new BadRequestException('Invalid anomaly type');
    if (parsedSeverity && !parsedSeverity.success) throw new BadRequestException('Invalid anomaly severity');
    return this.inventoryService.listAnomalies(req.tenantId, {
      type: parsedType?.data,
      severity: parsedSeverity?.data,
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
  @ApiOkResponse({ description: 'Inventory item and chronological provenance events.' })
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
  @ApiOkResponse({ schema: { example: InventoryItemExample } })
  @ApiForbiddenResponse({ description: 'Caller lacks inventory.read permission.' })
  getById(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    return this.inventoryService.getItem(id, req.tenantId);
  }

  @Patch(':id/reserve')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Reserve available inventory and optionally link it to an order' })
  @ApiOkResponse({ description: 'Inventory reserved.' })
  @ApiBadRequestResponse({ description: 'Reservation quantity exceeds available quantity.' })
  @ApiConflictResponse({ description: 'Inventory cannot be reserved.' })
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
  @ApiOkResponse({ description: 'Inventory reservation released.' })
  @ApiConflictResponse({ description: 'Inventory does not have an active reservation.' })
  release(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryReservationReleaseRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.releaseReservation(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Patch(':id/move')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Move inventory to a new location and record provenance' })
  @ApiOkResponse({ description: 'Inventory moved.' })
  @ApiBadRequestResponse({ description: 'Move request validation failed.' })
  @ApiConflictResponse({ description: 'Inventory cannot be moved.' })
  move(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<InventoryItem> {
    const parsed = InventoryMoveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return this.inventoryService.moveItem(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Delete(':id')
  @RequirePermissions('inventory.write')
  @ApiOperation({ summary: 'Soft-remove inventory while preserving its audit trail' })
  @ApiOkResponse({ description: 'Inventory soft-removed.' })
  @ApiBadRequestResponse({ description: 'Removal reason is required.' })
  @ApiConflictResponse({ description: 'Inventory cannot be removed.' })
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
