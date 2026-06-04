import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type {
  AuthResponse,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  ServiceTokenCreateRequest,
  ServiceTokenCreateResponse,
  UserDeactivationRequest,
  UserDeactivationResponse,
  UserRoleAssignmentRequest,
  UserRoleAssignmentResponse,
} from './auth.dto';
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  ServiceTokenCreateRequestSchema,
  ServiceTokenRevokeRequestSchema,
  UserDeactivationRequestSchema,
  UserRoleAssignmentRequestSchema,
} from './auth.dto';
import { AuthService } from './auth.service';
import type { AuthAuditContext } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimit } from './rate-limit.decorator';
import type { AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';

interface AuthenticatedRequest {
  user?: AuthenticatedLedgerActor;
  ip?: string;
  headers?: Record<string, string | string[] | undefined> & {
    authorization?: string;
  };
}

@Controller('v1/auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ maxRequests: 5, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate a user and return JWT access/refresh tokens' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
      example: { username: 'admin', password: 'admin' },
    },
  })
  @ApiOkResponse({
    description: 'Authenticated successfully.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            username: { type: 'string' },
            actorType: { type: 'string' },
            tenantId: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['userId', 'username', 'actorType', 'tenantId', 'permissions'],
        },
      },
      required: ['accessToken', 'refreshToken', 'user'],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid login request.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  login(@Body() body: LoginRequest, @Req() request: AuthenticatedRequest): Observable<AuthResponse> {
    const parseResult = LoginRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.login(parseResult.data, this.extractAuditContext(request));
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({ maxRequests: 3, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh an access token using a valid refresh token' })
  @ApiBody({ schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] } })
  @ApiOkResponse({
    description: 'New access and refresh tokens issued.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            username: { type: 'string' },
            actorType: { type: 'string' },
            tenantId: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['userId', 'username', 'actorType', 'tenantId', 'permissions'],
        },
      },
      required: ['accessToken', 'refreshToken', 'user'],
    },
  })
  @ApiBadRequestResponse({ description: 'Refresh token is missing or invalid.' })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid or expired.' })
  refresh(@Body() body: RefreshRequest, @Req() request: AuthenticatedRequest): Observable<AuthResponse> {
    const parseResult = RefreshRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.refresh(parseResult.data.refreshToken, this.extractAuditContext(request));
  }

  @Post('logout')
  @UseGuards(RateLimitGuard, JwtAuthGuard)
  @RateLimit({ maxRequests: 3, windowMs: 60_000 })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Revoke a refresh token and end the authenticated session' })
  @ApiBody({ schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] } })
  @ApiOkResponse({ description: 'Logout successful.' })
  @ApiBadRequestResponse({ description: 'Refresh token is missing or invalid.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  logout(@Body() body: LogoutRequest, @Req() request: AuthenticatedRequest): Observable<void> {
    const parseResult = LogoutRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    const accessToken = this.extractBearerToken(request.headers?.authorization);

    return this.authService.logout(parseResult.data.refreshToken, accessToken, this.extractAuditContext(request));
  }

  @Post('service-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Create a scoped service token for API access' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        permissions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['name', 'permissions'],
    },
  })
  @ApiOkResponse({
    description: 'Service token created successfully.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        tenantId: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
        token: { type: 'string' },
        createdAt: { type: 'string' },
        revoked: { type: 'boolean' },
      },
      required: ['id', 'name', 'tenantId', 'permissions', 'token', 'createdAt', 'revoked'],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid service token creation request.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'Caller lacks required permissions.' })
  createServiceToken(@Body() body: ServiceTokenCreateRequest, @Req() request: AuthenticatedRequest): Observable<ServiceTokenCreateResponse> {
    const parseResult = ServiceTokenCreateRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.createServiceToken(parseResult.data, this.extractAuditContext(request));
  }

  @Delete('service-token/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Revoke a previously issued service token' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Service token id.' })
  @ApiOkResponse({ description: 'Service token revoked successfully.' })
  @ApiBadRequestResponse({ description: 'Service token revocation request is invalid.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'Caller lacks required permissions.' })
  revokeServiceToken(@Param('id') id: string, @Req() request: AuthenticatedRequest): Observable<void> {
    const parseResult = ServiceTokenRevokeRequestSchema.safeParse({ id });
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.revokeServiceToken(parseResult.data.id, this.extractAuditContext(request));
  }

  @Post('users/:userId/roles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Assign one or more RBAC roles to a tenant user and emit an audit event' })
  @ApiParam({ name: 'userId', description: 'Tenant-scoped user id.', example: 'user-ops-001' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'ops.manager' },
        roles: {
          type: 'array',
          items: { type: 'string' },
          example: ['operations_manager', 'viewer'],
        },
      },
      required: ['roles'],
    },
  })
  @ApiOkResponse({
    description: 'Role assignment updated and effective permissions recalculated.',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        username: { type: 'string' },
        tenantId: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
        permissions: { type: 'array', items: { type: 'string' } },
        active: { type: 'boolean' },
        updatedAt: { type: 'string' },
      },
      required: ['userId', 'username', 'tenantId', 'roles', 'permissions', 'active', 'updatedAt'],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid role assignment request.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'Caller lacks required permissions.' })
  assignUserRoles(
    @Param('userId') userId: string,
    @Body() body: UserRoleAssignmentRequest,
    @Req() req: AuthenticatedRequest,
  ): Observable<UserRoleAssignmentResponse> {
    const parseResult = UserRoleAssignmentRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.assignUserRoles(userId, parseResult.data, req.user as AuthenticatedLedgerActor);
  }

  @Post('users/:userId/deactivate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Deactivate a tenant user and prevent future protected API access' })
  @ApiParam({ name: 'userId', description: 'Tenant-scoped user id.', example: 'user-ops-001' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Security hold during incident review' },
      },
      required: [],
    },
  })
  @ApiOkResponse({
    description: 'User deactivated successfully.',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        username: { type: 'string' },
        tenantId: { type: 'string' },
        active: { type: 'boolean' },
        updatedAt: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['userId', 'username', 'tenantId', 'active', 'updatedAt'],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid user deactivation request.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'Caller lacks required permissions.' })
  deactivateUser(
    @Param('userId') userId: string,
    @Body() body: UserDeactivationRequest,
    @Req() req: AuthenticatedRequest,
  ): Observable<UserDeactivationResponse> {
    const parseResult = UserDeactivationRequestSchema.safeParse(body ?? {});
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    return this.authService.deactivateUser(userId, parseResult.data, req.user as AuthenticatedLedgerActor);
  }

  private extractBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
      throw new BadRequestException('Missing bearer token');
    }

    if (!authorizationHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Invalid bearer token');
    }

    const token = authorizationHeader.slice(7).trim();
    if (!token) {
      throw new BadRequestException('Invalid bearer token');
    }

    return token;
  }

  private extractAuditContext(request: AuthenticatedRequest): AuthAuditContext {
    return {
      sourceIp: request.ip,
      userAgent: request.headers?.['user-agent'],
      correlationId: request.headers?.['x-correlation-id'],
    };
  }
}
