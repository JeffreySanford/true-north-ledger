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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  DeviceHeartbeatRequestSchema,
  DeviceHardwareExamples,
  DeviceRegistrationRequestSchema,
  DeviceStatusSchema,
  DeviceStatusUpdateRequestSchema,
  DeviceTypeSchema,
} from '@true-north-ledger/device-contracts';
import type {
  Device,
  DeviceHeartbeatRequest,
  DeviceHeartbeatResponse,
  DeviceListResponse,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceStatusUpdateRequest,
} from '@true-north-ledger/device-contracts';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import type { AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';
import type { DeviceActor } from './devices.service';
import { DeviceAuthGuard } from './device-auth.guard';
import { DevicesService } from './devices.service';

interface AuthenticatedRequest {
  user: (AuthenticatedLedgerActor & { permissions?: string[] }) | DeviceActor;
  tenantId: string;
  deviceId?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Devices')
@Controller('v1/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @UseGuards(TokenAuthGuard, TenantGuard, RateLimitGuard, PermissionsGuard)
  @RequirePermissions('devices.manage')
  @RateLimit({ maxRequests: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Register a tenant-scoped device and return its API key once' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'type'],
      example: DeviceHardwareExamples.scanner.registration,
      properties: {
        name: { type: 'string', example: 'Receiving scanner 01' },
        type: { type: 'string', enum: DeviceTypeSchema.options },
        permissions: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Device registered. The raw API key and QR provisioning payload are returned only in this response.',
    schema: {
      type: 'object',
      required: ['id', 'name', 'type', 'tenantId', 'status', 'permissions', 'apiKey', 'provisioningPayload', 'provisioningUri'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        type: { type: 'string', enum: DeviceTypeSchema.options },
        tenantId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: DeviceStatusSchema.options },
        permissions: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object', additionalProperties: true },
        heartbeatFailureCount: { type: 'integer', minimum: 0 },
        autoSuspendedAt: { type: 'string', format: 'date-time', nullable: true },
        apiKey: { type: 'string', example: 'tnl_dev_...' },
        provisioningUri: { type: 'string', example: 'tnl-device://provision?payload=...' },
        provisioningPayload: {
          type: 'object',
          required: ['version', 'deviceId', 'deviceName', 'deviceType', 'tenantId', 'apiKey', 'heartbeatPath', 'deviceEventPath', 'batchDeviceEventPath', 'issuedAt'],
          properties: {
            version: { type: 'integer', enum: [1] },
            deviceId: { type: 'string', format: 'uuid' },
            deviceName: { type: 'string' },
            deviceType: { type: 'string', enum: DeviceTypeSchema.options },
            tenantId: { type: 'string', format: 'uuid' },
            apiKey: { type: 'string' },
            heartbeatPath: { type: 'string' },
            deviceEventPath: { type: 'string' },
            batchDeviceEventPath: { type: 'string' },
            issuedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid registration payload.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'Caller lacks devices.manage permission.' })
  register(
    @Body() body: DeviceRegistrationRequest,
    @Req() req: AuthenticatedRequest,
  ): Observable<DeviceRegistrationResponse> {
    const parsed = DeviceRegistrationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.devicesService.registerDevice(parsed.data, req.user, this.requestContext(req));
  }

  @Get()
  @UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'List tenant devices with optional status, type, and name filters' })
  @ApiQuery({ name: 'status', required: false, enum: DeviceStatusSchema.options })
  @ApiQuery({ name: 'type', required: false, enum: DeviceTypeSchema.options })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '1-based page number. Defaults to 1.' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Devices per page, 1-100. Defaults to 50.' })
  @ApiOkResponse({ description: 'Tenant-scoped device list.' })
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Observable<DeviceListResponse> {
    const parsedStatus = status ? DeviceStatusSchema.safeParse(status) : undefined;
    const parsedType = type ? DeviceTypeSchema.safeParse(type) : undefined;
    const parsedPage = this.parsePositiveIntegerQuery(page, 'page', 1, 10_000);
    const parsedPageSize = this.parsePositiveIntegerQuery(pageSize, 'pageSize', 50, 100);

    if (parsedStatus && !parsedStatus.success) {
      throw new BadRequestException('Invalid device status filter');
    }

    if (parsedType && !parsedType.success) {
      throw new BadRequestException('Invalid device type filter');
    }

    return this.devicesService.listDevices(req.tenantId, {
      status: parsedStatus?.data,
      type: parsedType?.data,
      search,
      page: parsedPage,
      pageSize: parsedPageSize,
    });
  }

  @Get(':id/status')
  @UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('devices.read')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Read one tenant device status and heartbeat state' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Device status returned.' })
  getStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest): Observable<Device> {
    return this.devicesService.getDeviceStatus(id, req.tenantId);
  }

  @Patch(':id/status')
  @UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('devices.manage')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update a tenant device status and record an audit event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: DeviceStatusSchema.options },
        reason: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Device status updated.' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: DeviceStatusUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ): Observable<Device> {
    const parsed = DeviceStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.devicesService.updateDeviceStatus(id, req.tenantId, parsed.data, req.user, this.requestContext(req));
  }

  @Delete(':id')
  @UseGuards(TokenAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('devices.manage')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Revoke a tenant device and block future device-key authentication' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Device revoked.' })
  revoke(@Param('id') id: string, @Req() req: AuthenticatedRequest): Observable<Device> {
    return this.devicesService.revokeDevice(id, req.tenantId, req.user, this.requestContext(req));
  }

  @Post('heartbeat')
  @UseGuards(DeviceAuthGuard, RateLimitGuard)
  @RateLimit({ maxRequests: 1, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a heartbeat from a device using the X-Device-Key header' })
  @ApiHeader({ name: 'X-Device-Key', required: true, description: 'Raw device API key returned at registration.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['online', 'degraded'] },
        metrics: { type: 'object', additionalProperties: true },
      },
    },
  })
  @ApiOkResponse({ description: 'Heartbeat accepted.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, revoked, or suspended device key.' })
  heartbeat(
    @Body() body: DeviceHeartbeatRequest,
    @Req() req: AuthenticatedRequest,
  ): Observable<DeviceHeartbeatResponse> {
    const parsed = DeviceHeartbeatRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    if (req.user.actorType !== 'device') {
      throw new BadRequestException('Device actor context is required');
    }

    return this.devicesService.heartbeatForActor(req.user as DeviceActor, parsed.data, this.requestContext(req));
  }

  private requestContext(req: AuthenticatedRequest) {
    return {
      sourceIp: req.ip,
      userAgent: req.headers?.['user-agent'],
      correlationId: req.headers?.['x-correlation-id'],
    };
  }

  private parsePositiveIntegerQuery(value: string | undefined, name: string, defaultValue: number, maxValue: number): number {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
      throw new BadRequestException(`${name} must be an integer between 1 and ${maxValue}`);
    }

    return parsed;
  }
}
