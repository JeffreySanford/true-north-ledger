import {
  BadRequestException,
  Body,
  Controller,
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
  ApiTooManyRequestsResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  CreateOrderRequestExample,
  CreateOrderRequestSchema,
  Order,
  OrderCancelRequestSchema,
  OrderDetailResponse,
  OrderExample,
  OrderListResponse,
  OrderProof,
  OrderProofVerificationRequestSchema,
  OrderProofVerificationResponse,
  OrderSearchRequest,
  OrderStatusSchema,
  OrderStatusUpdateRequestSchema,
  OrderTimelineEvent,
} from '@true-north-ledger/order-contracts';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import type { AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';
import type { LedgerRequestContext } from '../ledger-events/ledger-events.service';
import { OrdersService } from './orders.service';

const orderErrorExample = {
  statusCode: 409,
  message: 'Invalid order status transition: delivered -> pending',
  code: 'ORDER_INVALID_STATUS_TRANSITION',
};

const orderStatusUpdateExample = {
  status: 'confirmed',
  reason: 'Customer and payment details verified',
};

const orderCancelExample = {
  reason: 'Customer requested cancellation before shipment',
};

interface AuthenticatedRequest {
  user: AuthenticatedLedgerActor & { permissions?: string[] };
  tenantId: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Orders')
@ApiBearerAuth('jwt')
@Controller('v1/orders')
@UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RequirePermissions('orders.write')
  @RateLimit({ maxRequests: 20, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a tenant-scoped order and ledger audit event',
  })
  @ApiBody({ description: 'Order creation payload.', schema: { example: CreateOrderRequestExample } })
  @ApiCreatedResponse({ description: 'Order created.', schema: { example: OrderExample } })
  @ApiBadRequestResponse({ description: 'Order payload validation failed.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.write permission.' })
  @ApiTooManyRequestsResponse({ description: 'Per-user order creation rate limit exceeded.' })
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<Order> {
    const parsed = CreateOrderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.ordersService.createOrder(
      parsed.data,
      req.user,
      this.requestContext(req),
    );
  }

  @Get()
  @RequirePermissions('orders.read')
  @ApiOperation({
    summary: 'List tenant-scoped orders with filters and pagination',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatusSchema.options,
  })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'totalAmount'],
  })
  @ApiQuery({ name: 'sortDirection', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ description: 'Tenant-scoped order list.' })
  @ApiBadRequestResponse({ description: 'Invalid filter, pagination, or sort value.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.read permission.' })
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('query') query?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ): Observable<OrderListResponse> {
    return this.ordersService.listOrders(req.tenantId, {
      status: this.parseStatus(status),
      customerId,
      query,
      createdFrom,
      createdTo,
      page: this.parsePositiveInteger(page, 1, 10_000),
      pageSize: this.parsePositiveInteger(pageSize, 25, 100),
      sortBy: this.parseSortBy(sortBy),
      sortDirection: this.parseSortDirection(sortDirection),
    });
  }

  @Get('search')
  @RequirePermissions('orders.read')
  @ApiOperation({
    summary: 'Search tenant-scoped orders by order, customer, date, and metadata text',
  })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatusSchema.options })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Matching tenant-scoped order list.' })
  @ApiBadRequestResponse({ description: 'Invalid search filter or pagination value.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.read permission.' })
  search(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('query') query?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Observable<OrderListResponse> {
    return this.ordersService.listOrders(req.tenantId, {
      status: this.parseStatus(status),
      customerId,
      query,
      createdFrom,
      createdTo,
      page: this.parsePositiveInteger(page, 1, 10_000),
      pageSize: this.parsePositiveInteger(pageSize, 25, 100),
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
  }

  @Get('number/:orderNumber')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'Get a tenant order by order number' })
  @ApiParam({ name: 'orderNumber' })
  @ApiOkResponse({ description: 'Order detail returned.' })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.read permission.' })
  getByNumber(
    @Param('orderNumber') orderNumber: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<OrderDetailResponse> {
    return this.ordersService.getOrderByNumber(orderNumber, req.tenantId);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'Get a tenant order with ledger timeline' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Order detail returned.' })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.read permission.' })
  get(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<OrderDetailResponse> {
    return this.ordersService.getOrder(id, req.tenantId);
  }

  @Patch(':id/status')
  @RequirePermissions('orders.status.write')
  @ApiOperation({
    summary: 'Update order status and append an audit event',
    description: 'Allowed lifecycle: pending -> confirmed -> processing -> shipped -> delivered. Delivered, cancelled, and failed orders are terminal.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ description: 'Status update payload.', schema: { example: orderStatusUpdateExample } })
  @ApiOkResponse({ description: 'Order status updated.' })
  @ApiBadRequestResponse({ description: 'Status update payload validation failed.' })
  @ApiConflictResponse({ description: 'Invalid order status transition.', schema: { example: orderErrorExample } })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.status.write permission.' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<Order> {
    const parsed = OrderStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.ordersService.updateStatus(
      id,
      req.tenantId,
      parsed.data,
      req.user,
      this.requestContext(req),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('orders.status.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an order before shipment and append an audit event',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ description: 'Cancellation payload.', schema: { example: orderCancelExample } })
  @ApiOkResponse({ description: 'Order cancelled.' })
  @ApiBadRequestResponse({ description: 'Cancellation reason validation failed.' })
  @ApiConflictResponse({ description: 'Order cannot be cancelled after shipment.', schema: { example: orderErrorExample } })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.status.write permission.' })
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Observable<Order> {
    const parsed = OrderCancelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.ordersService.cancelOrder(
      id,
      req.tenantId,
      parsed.data,
      req.user,
      this.requestContext(req),
    );
  }

  @Get(':id/timeline')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'Get chronological order ledger timeline' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Order timeline returned.' })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks orders.read permission.' })
  timeline(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<OrderTimelineEvent[]> {
    return this.ordersService.getTimeline(id, req.tenantId);
  }

  @Get(':id/proof')
  @RequirePermissions('proof.read')
  @ApiOperation({ summary: 'Generate an order proof from ledger events' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Order proof returned.' })
  @ApiNotFoundResponse({ description: 'Order not found for tenant.' })
  @ApiForbiddenResponse({ description: 'Caller lacks proof.read permission.' })
  proof(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Observable<OrderProof> {
    return this.ordersService.getProof(id, req.tenantId);
  }

  private parseStatus(
    status: string | undefined,
  ): OrderSearchRequest['status'] {
    if (!status) {
      return undefined;
    }

    const parsed = OrderStatusSchema.safeParse(status);
    if (!parsed.success) {
      throw new BadRequestException('Invalid order status filter');
    }

    return parsed.data;
  }

  private parseSortBy(
    sortBy: string | undefined,
  ): OrderSearchRequest['sortBy'] {
    if (!sortBy) {
      return 'createdAt';
    }
    if (sortBy !== 'createdAt' && sortBy !== 'totalAmount') {
      throw new BadRequestException('Invalid order sort field');
    }
    return sortBy;
  }

  private parseSortDirection(
    sortDirection: string | undefined,
  ): OrderSearchRequest['sortDirection'] {
    if (!sortDirection) {
      return 'desc';
    }
    if (sortDirection !== 'asc' && sortDirection !== 'desc') {
      throw new BadRequestException('Invalid order sort direction');
    }
    return sortDirection;
  }

  private parsePositiveInteger(
    value: string | undefined,
    fallback: number,
    max: number,
  ): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw new BadRequestException(`Expected integer between 1 and ${max}`);
    }

    return parsed;
  }

  private requestContext(req: AuthenticatedRequest): LedgerRequestContext {
    return {
      sourceIp: req.ip,
      userAgent: req.headers?.['user-agent'],
      correlationId: req.headers?.['x-correlation-id'],
    };
  }
}

@ApiTags('Proofs')
@ApiBearerAuth('jwt')
@Controller('v1/proofs')
@UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
export class ProofsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('verify')
  @RequirePermissions('proof.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an order proof hash' })
  @ApiOkResponse({ description: 'Proof verification result returned.' })
  @ApiBadRequestResponse({ description: 'Proof payload validation failed.' })
  @ApiForbiddenResponse({ description: 'Caller lacks proof.read permission.' })
  verifyProof(
    @Body() body: unknown,
  ): Observable<OrderProofVerificationResponse> {
    const parsed = OrderProofVerificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.ordersService.verifyProof(parsed.data.proof);
  }
}
