import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { defer, Observable, of, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { AuthLedgerEventAction } from '@true-north-ledger/ledger-contracts';
import { LedgerEventsService, AuthenticatedLedgerActor } from '../ledger-events/ledger-events.service';
import {
  AuthResponse,
  AuthUser,
  JwtPayload,
  LoginRequest,
  ServiceTokenCreateRequest,
  ServiceTokenCreateResponse,
  UserDeactivationRequest,
  UserDeactivationResponse,
  UserRoleAssignmentRequest,
  UserRoleAssignmentResponse,
} from './auth.dto';
import { requiredEnv } from '../config/required-env';
import { ROLE_NAMES, ROLE_PERMISSION_CATALOG, RoleName } from './role-permissions';
import { ServiceTokenEntity } from './service-token.entity';
import { TenantRolePermissionEntity } from './tenant-role-permission.entity';
import { TokenBlacklistService } from './token-blacklist.service';
import { UserRoleRecordEntity } from './user-role-record.entity';

interface ServiceTokenRecord {
  id: string;
  name: string;
  tenantId: string;
  permissions: string[];
  hashedToken: string;
  revoked: boolean;
  createdAt: Date;
  revokedAt?: Date;
}

interface UserRoleRecord {
  userId: string;
  username: string;
  tenantId: string;
  roles: RoleName[];
  active: boolean;
  updatedAt: Date;
}

interface ResolvedActorContext {
  userId?: string;
  username?: string;
  actorType?: 'user' | 'service' | 'device' | 'system';
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthAuditContext {
  sourceIp?: string;
  userAgent?: string | string[];
  correlationId?: string | string[];
}

type TenantRolePermissionMap = Record<RoleName, string[]>;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly allowedUsername: string;
  private readonly allowedPasswordHash: string;
  private readonly tenantId: string;
  private readonly refreshExpiration: string;
  private readonly refreshTokenIds = new Set<string>();
  private readonly serviceTokenByHash = new Map<string, ServiceTokenRecord>();
  private readonly serviceTokenById = new Map<string, ServiceTokenRecord>();
  private readonly usersById = new Map<string, UserRoleRecord>();
  private readonly userIdByUsername = new Map<string, string>();
  private readonly rolePermissionsByTenant = new Map<string, TenantRolePermissionMap>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly ledgerEventsService: LedgerEventsService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    @Optional()
    @InjectRepository(ServiceTokenEntity)
    private readonly serviceTokenRepository?: Repository<ServiceTokenEntity>,
    @Optional()
    @InjectRepository(TenantRolePermissionEntity)
    private readonly tenantRolePermissionRepository?: Repository<TenantRolePermissionEntity>,
    @Optional()
    @InjectRepository(UserRoleRecordEntity)
    private readonly userRoleRecordRepository?: Repository<UserRoleRecordEntity>,
  ) {
    this.allowedUsername = process.env.AUTH_USERNAME ??
      (process.env.NODE_ENV === 'production'
        ? requiredEnv('AUTH_USERNAME')
        : 'admin');
    const rawPassword = process.env.AUTH_PASSWORD ??
      (process.env.NODE_ENV === 'production'
        ? requiredEnv('AUTH_PASSWORD')
        : 'admin');
    this.allowedPasswordHash = this.hashPassword(rawPassword);
    this.tenantId = process.env.AUTH_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
    this.refreshExpiration = process.env.JWT_REFRESH_EXPIRATION ?? '7d';
    this.rolePermissionsByTenant.set(this.tenantId, this.getDefaultRolePermissionMap());
    this.seedDefaultAdminUser();
  }

  async onModuleInit(): Promise<void> {
    await this.ensureRolePermissionSeedForTenant(this.tenantId);
    await this.loadUserRoleRecordsFromDatabase();
    await this.ensureDefaultAdminUserRecord();
    await this.loadServiceTokensFromDatabase();
  }

  login(request: LoginRequest, auditContext?: AuthAuditContext): Observable<AuthResponse> {
    return defer(() => {
      const { username, password } = request;
      if (!this.verifyCredentials(username, password)) {
        this.appendLoginFailedEvent(username, auditContext);
        throw new UnauthorizedException('Invalid username or password');
      }

      const user = this.buildUser(username);
      if (!this.isActorActive(user)) {
        this.appendLoginFailedEvent(username, auditContext);
        throw new UnauthorizedException('User is deactivated');
      }
      const accessToken = this.createAccessToken(user);
      const refreshToken = this.createRefreshToken(user);

      return of({
        accessToken,
        refreshToken,
        user,
      }).pipe(
        tap(() => this.appendLoginEvent(user, auditContext)),
      );
    });
  }

  refresh(refreshToken: string, auditContext?: AuthAuditContext): Observable<AuthResponse> {
    return defer(() => {
      const payload = this.verifyRefreshToken(refreshToken);
      const user = this.buildUser(payload.username ?? this.allowedUsername);

      this.revokeRefreshToken(refreshToken);
      const accessToken = this.createAccessToken(user);
      const nextRefreshToken = this.createRefreshToken(user);

      return of({
        accessToken,
        refreshToken: nextRefreshToken,
        user,
      }).pipe(
        tap(() => this.appendRefreshEvent(user, auditContext)),
      );
    });
  }

  logout(refreshToken: string, accessToken: string, auditContext?: AuthAuditContext): Observable<void> {
    return defer(async () => {
      if (!refreshToken) {
        throw new BadRequestException('Refresh token is required for logout');
      }
      if (!accessToken) {
        throw new BadRequestException('Access token is required for logout');
      }

      const payload = this.verifyRefreshToken(refreshToken);
      const user = this.buildUser(payload.username ?? this.allowedUsername);

      this.revokeRefreshToken(refreshToken);
      await this.blacklistAccessToken(accessToken);
      this.appendLogoutEvent(user, auditContext);
    });
  }

  private verifyCredentials(username: string, password: string): boolean {
    if (username !== this.allowedUsername) {
      return false;
    }
    return this.hashPassword(password) === this.allowedPasswordHash;
  }

  private createAccessToken(user: AuthUser): string {
    const payload: JwtPayload = {
      sub: user.userId,
      actorType: user.actorType,
      tenantId: user.tenantId,
      roles: user.roles,
      permissions: user.permissions,
      username: user.username,
      tokenType: 'access',
      jti: randomUUID(),
    };

    const options = {
      expiresIn: process.env.JWT_EXPIRATION ?? '1h',
    } as unknown as SignOptions;

    return this.jwtService.sign(payload, options);
  }

  private createRefreshToken(user: AuthUser): string {
    const jti = randomUUID();
    const payload: JwtPayload = {
      sub: user.userId,
      actorType: user.actorType,
      tenantId: user.tenantId,
      roles: user.roles,
      permissions: user.permissions,
      username: user.username,
      tokenType: 'refresh',
      jti,
    };

    const options = {
      expiresIn: this.refreshExpiration,
    } as unknown as SignOptions;

    const refreshToken = this.jwtService.sign(payload, options);
    this.storeRefreshToken(jti);
    return refreshToken;
  }

  private verifyRefreshToken(refreshToken: string): JwtPayload {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (payload.tokenType !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    if (!this.refreshTokenIds.has(payload.jti)) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    return payload;
  }

  private revokeRefreshToken(refreshToken: string): void {
    const payload = this.jwtService.decode(refreshToken) as { jti?: string } | null;
    if (payload?.jti) {
      this.refreshTokenIds.delete(payload.jti);
    }
  }

  private storeRefreshToken(jti: string): void {
    this.refreshTokenIds.add(jti);
  }

  private async blacklistAccessToken(accessToken: string): Promise<void> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(accessToken);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }

    if (payload.tokenType !== 'access' || !payload.jti) {
      throw new UnauthorizedException('Access token is invalid');
    }

    const ttlSeconds = typeof payload.exp === 'number'
      ? payload.exp - Math.floor(Date.now() / 1000)
      : 3600;
    if (ttlSeconds <= 0) {
      return;
    }

    await this.tokenBlacklistService.blacklistJti(payload.jti, ttlSeconds);
  }

  createServiceToken(request: ServiceTokenCreateRequest, auditContext?: AuthAuditContext): Observable<ServiceTokenCreateResponse> {
    return defer(async () => {
      const id = randomUUID();
      const rawToken = randomUUID() + '.' + randomUUID();
      const hashedToken = this.hashToken(rawToken);
      const record: ServiceTokenRecord = {
        id,
        name: request.name,
        tenantId: this.tenantId,
        permissions: request.permissions,
        hashedToken,
        revoked: false,
        createdAt: new Date(),
      };

      this.serviceTokenByHash.set(hashedToken, record);
      this.serviceTokenById.set(id, record);

      if (this.serviceTokenRepository) {
        await this.serviceTokenRepository.save({
          id: record.id,
          name: record.name,
          tenantId: record.tenantId,
          permissions: record.permissions,
          hashedToken: record.hashedToken,
          revoked: record.revoked,
          createdAt: record.createdAt,
        });
      }

      this.appendServiceTokenEvent(record, AuthLedgerEventAction.SERVICE_TOKEN_CREATED, auditContext);

      return {
        id,
        name: request.name,
        tenantId: this.tenantId,
        permissions: request.permissions,
        token: rawToken,
        createdAt: record.createdAt.toISOString(),
        revoked: record.revoked,
      };
    });
  }

  revokeServiceToken(id: string, auditContext?: AuthAuditContext): Observable<void> {
    return defer(async () => {
      const record = this.serviceTokenById.get(id);
      if (!record) {
        throw new BadRequestException('Service token not found');
      }

      record.revoked = true;
      record.revokedAt = new Date();

      if (this.serviceTokenRepository) {
        await this.serviceTokenRepository.update(
          { id: record.id },
          {
            revoked: true,
            revokedAt: record.revokedAt,
          },
        );
      }

      this.appendServiceTokenEvent(record, AuthLedgerEventAction.SERVICE_TOKEN_REVOKED, auditContext);
    });
  }

  async verifyServiceToken(token: string): Promise<AuthUser> {
    const hash = this.hashToken(token);
    let record = this.serviceTokenByHash.get(hash);

    if (!record && this.serviceTokenRepository) {
      const fromDb = await this.serviceTokenRepository.findOne({ where: { hashedToken: hash } });
      if (fromDb) {
        record = {
          id: fromDb.id,
          name: fromDb.name,
          tenantId: fromDb.tenantId,
          permissions: fromDb.permissions,
          hashedToken: fromDb.hashedToken,
          revoked: fromDb.revoked,
          createdAt: fromDb.createdAt,
          revokedAt: fromDb.revokedAt,
        };
        this.serviceTokenByHash.set(hash, record);
        this.serviceTokenById.set(record.id, record);
      }
    }

    if (!record || record.revoked) {
      throw new UnauthorizedException('Invalid or revoked service token');
    }

    return {
      userId: record.id,
      username: record.name,
      actorType: 'service',
      tenantId: record.tenantId,
      roles: [],
      permissions: record.permissions,
    };
  }

  resolveRolesForActor(actor: ResolvedActorContext): RoleName[] {
    const directRoles = this.normalizeRoles(actor.roles);
    if (directRoles.length > 0) {
      return directRoles;
    }

    if (actor.userId) {
      const assignedByUserId = this.usersById.get(actor.userId);
      if (assignedByUserId && assignedByUserId.active) {
        return assignedByUserId.roles;
      }
    }

    if (actor.username) {
      const mappedUserId = this.userIdByUsername.get(actor.username);
      if (mappedUserId) {
        const assignedByUsername = this.usersById.get(mappedUserId);
        if (assignedByUsername && assignedByUsername.active) {
          return assignedByUsername.roles;
        }
      }
    }

    return [];
  }

  resolvePermissionsForActor(actor: ResolvedActorContext): string[] {
    const resolvedRoles = this.resolveRolesForActor(actor);
    const rolePermissionsForTenant = this.getRolePermissionsForTenant(actor.tenantId);
    const rolePermissions = resolvedRoles.flatMap((role) => rolePermissionsForTenant[role] ?? []);
    const directPermissions = actor.permissions ?? [];

    return Array.from(new Set([...directPermissions, ...rolePermissions]));
  }

  assignUserRoles(
    userId: string,
    request: UserRoleAssignmentRequest,
    assignedBy: AuthenticatedLedgerActor,
  ): Observable<UserRoleAssignmentResponse> {
    return defer(async () => {
      const roles = this.normalizeRoles(request.roles);
      if (roles.length !== request.roles.length) {
        throw new BadRequestException(`Unknown roles supplied. Allowed roles: ${ROLE_NAMES.join(', ')}`);
      }

      const existing = this.usersById.get(userId);
      const username = request.username ?? existing?.username ?? userId;
      const updatedAt = new Date();
      const record: UserRoleRecord = {
        userId,
        username,
        tenantId: this.tenantId,
        roles,
        active: true,
        updatedAt,
      };

      this.usersById.set(userId, record);
      this.userIdByUsername.set(username, userId);

      if (this.userRoleRecordRepository) {
        await this.upsertUserRoleRecord(record);
      }

      const permissions = this.resolvePermissionsForActor({
        userId,
        username,
        roles,
        tenantId: this.tenantId,
      });

      this.appendRoleAssignmentEvent(assignedBy, record, permissions);

      return {
        userId,
        username,
        tenantId: this.tenantId,
        roles,
        permissions,
        active: true,
        updatedAt: updatedAt.toISOString(),
      };
    });
  }

  deactivateUser(
    userId: string,
    request: UserDeactivationRequest,
    deactivatedBy: AuthenticatedLedgerActor,
  ): Observable<UserDeactivationResponse> {
    return defer(async () => {
      const existing = this.usersById.get(userId);
      const username = existing?.username ?? userId;
      const updatedAt = new Date();
      const record: UserRoleRecord = {
        userId,
        username,
        tenantId: this.tenantId,
        roles: existing?.roles ?? [],
        active: false,
        updatedAt,
      };

      this.usersById.set(userId, record);
      this.userIdByUsername.set(username, userId);

      if (this.userRoleRecordRepository) {
        await this.upsertUserRoleRecord(record);
      }

      this.appendUserDeactivatedEvent(deactivatedBy, record, request.reason);

      return {
        userId,
        username,
        tenantId: this.tenantId,
        active: false,
        updatedAt: updatedAt.toISOString(),
        reason: request.reason,
      };
    });
  }

  isActorActive(actor: ResolvedActorContext): boolean {
    if ((actor.actorType ?? 'user') !== 'user') {
      return true;
    }

    if (actor.userId) {
      const byId = this.usersById.get(actor.userId);
      if (byId) {
        return byId.active;
      }
    }

    if (actor.username) {
      const mappedUserId = this.userIdByUsername.get(actor.username);
      if (mappedUserId) {
        const byUsername = this.usersById.get(mappedUserId);
        if (byUsername) {
          return byUsername.active;
        }
      }
    }

    return true;
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async loadServiceTokensFromDatabase(): Promise<void> {
    if (!this.serviceTokenRepository) {
      return;
    }

    const rows = await this.serviceTokenRepository.find();
    for (const row of rows) {
      const record: ServiceTokenRecord = {
        id: row.id,
        name: row.name,
        tenantId: row.tenantId,
        permissions: row.permissions,
        hashedToken: row.hashedToken,
        revoked: row.revoked,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
      };

      this.serviceTokenByHash.set(record.hashedToken, record);
      this.serviceTokenById.set(record.id, record);
    }
  }

  private async loadUserRoleRecordsFromDatabase(): Promise<void> {
    if (!this.userRoleRecordRepository) {
      return;
    }

    const rows = await this.userRoleRecordRepository.find({ where: { tenantId: this.tenantId } });
    if (rows.length === 0) {
      return;
    }

    this.usersById.clear();
    this.userIdByUsername.clear();

    for (const row of rows) {
      const normalizedRoles = this.normalizeRoles(row.roles);
      const record: UserRoleRecord = {
        userId: row.userId,
        username: row.username,
        tenantId: row.tenantId,
        roles: normalizedRoles,
        active: row.active,
        updatedAt: row.updatedAt,
      };
      this.usersById.set(record.userId, record);
      this.userIdByUsername.set(record.username, record.userId);
    }
  }

  private async ensureDefaultAdminUserRecord(): Promise<void> {
    let admin = this.usersById.get('admin');
    if (!admin) {
      this.seedDefaultAdminUser();
      admin = this.usersById.get('admin');
    }

    if (admin && this.userRoleRecordRepository) {
      await this.upsertUserRoleRecord(admin);
    }
  }

  private async upsertUserRoleRecord(record: UserRoleRecord): Promise<void> {
    if (!this.userRoleRecordRepository) {
      return;
    }

    const existing = await this.userRoleRecordRepository.findOne({
      where: {
        tenantId: record.tenantId,
        userId: record.userId,
      },
    });

    const entity = this.userRoleRecordRepository.create({
      id: existing?.id,
      tenantId: record.tenantId,
      userId: record.userId,
      username: record.username,
      roles: record.roles,
      active: record.active,
      updatedAt: record.updatedAt,
    });

    await this.userRoleRecordRepository.save(entity);
  }

  private async ensureRolePermissionSeedForTenant(tenantId: string): Promise<void> {
    const defaults = this.getDefaultRolePermissionMap();

    if (!this.tenantRolePermissionRepository) {
      this.rolePermissionsByTenant.set(tenantId, defaults);
      return;
    }

    const existing = await this.tenantRolePermissionRepository.find({ where: { tenantId } });
    const byRole = new Map(existing.map((entry) => [entry.role, entry]));

    const missing: TenantRolePermissionEntity[] = [];
    for (const role of ROLE_NAMES) {
      if (!byRole.has(role)) {
        missing.push(this.tenantRolePermissionRepository.create({
          tenantId,
          role,
          permissions: defaults[role],
        }));
      }
    }

    if (missing.length > 0) {
      await this.tenantRolePermissionRepository.save(missing);
    }

    const seeded = await this.tenantRolePermissionRepository.find({ where: { tenantId } });
    const nextMap = this.getDefaultRolePermissionMap();
    for (const entry of seeded) {
      if (ROLE_NAMES.includes(entry.role as RoleName)) {
        nextMap[entry.role as RoleName] = [...entry.permissions];
      }
    }

    this.rolePermissionsByTenant.set(tenantId, nextMap);
  }

  private getRolePermissionsForTenant(tenantId: string | undefined): TenantRolePermissionMap {
    return this.rolePermissionsByTenant.get(tenantId ?? this.tenantId) ?? this.getDefaultRolePermissionMap();
  }

  private getDefaultRolePermissionMap(): TenantRolePermissionMap {
    return {
      admin: [...ROLE_PERMISSION_CATALOG.admin],
      operations_manager: [...ROLE_PERMISSION_CATALOG.operations_manager],
      inventory: [...ROLE_PERMISSION_CATALOG.inventory],
      shipping: [...ROLE_PERMISSION_CATALOG.shipping],
      billing: [...ROLE_PERMISSION_CATALOG.billing],
      moderator: [...ROLE_PERMISSION_CATALOG.moderator],
      auditor: [...ROLE_PERMISSION_CATALOG.auditor],
      device_technician: [...ROLE_PERMISSION_CATALOG.device_technician],
      support: [...ROLE_PERMISSION_CATALOG.support],
      viewer: [...ROLE_PERMISSION_CATALOG.viewer],
    };
  }

  private buildUser(username: string): AuthUser {
    const mappedUserId = this.userIdByUsername.get(username) ?? 'admin';
    const resolvedRoles = this.resolveRolesForActor({ userId: mappedUserId, username, actorType: 'user' });
    const resolvedPermissions = this.resolvePermissionsForActor({
      userId: mappedUserId,
      username,
      actorType: 'user',
      roles: resolvedRoles,
    });

    return {
      userId: mappedUserId,
      username,
      actorType: 'user',
      tenantId: this.tenantId,
      roles: resolvedRoles,
      permissions: resolvedPermissions,
    };
  }

  private seedDefaultAdminUser(): void {
    const adminRecord: UserRoleRecord = {
      userId: 'admin',
      username: this.allowedUsername,
      tenantId: this.tenantId,
      roles: ['admin'],
      active: true,
      updatedAt: new Date(),
    };
    this.usersById.set(adminRecord.userId, adminRecord);
    this.userIdByUsername.set(adminRecord.username, adminRecord.userId);
  }

  private normalizeRoles(roles: string[] | undefined): RoleName[] {
    if (!roles || roles.length === 0) {
      return [];
    }

    const normalized: RoleName[] = [];
    for (const role of roles) {
      if (ROLE_NAMES.includes(role as RoleName)) {
        normalized.push(role as RoleName);
      }
    }

    return Array.from(new Set(normalized));
  }

  private appendLoginEvent(user: AuthUser, auditContext?: AuthAuditContext): void {
    const actor: AuthenticatedLedgerActor = {
      userId: user.userId,
      actorType: user.actorType,
      tenantId: user.tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: user.userId,
          payload: {
            action: AuthLedgerEventAction.LOGIN_SUCCESS,
            username: user.username,
          },
        },
        actor,
        user.tenantId,
        this.resolveAuditContext(auditContext),
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record login event', error);
          }
        },
      });
  }

  private appendLogoutEvent(user: AuthUser, auditContext?: AuthAuditContext): void {
    const actor: AuthenticatedLedgerActor = {
      userId: user.userId,
      actorType: user.actorType,
      tenantId: user.tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: user.userId,
          payload: {
            action: AuthLedgerEventAction.LOGOUT,
            username: user.username,
          },
        },
        actor,
        user.tenantId,
        this.resolveAuditContext(auditContext),
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record logout event', error);
          }
        },
      });
  }

  private appendLoginFailedEvent(username: string, auditContext?: AuthAuditContext): void {
    const actor: AuthenticatedLedgerActor = {
      userId: username || 'unknown',
      actorType: 'user',
      tenantId: this.tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: username || 'unknown',
          payload: {
            action: AuthLedgerEventAction.LOGIN_FAILED,
            username,
          },
        },
        actor,
        this.tenantId,
        this.resolveAuditContext(auditContext),
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record failed login event', error);
          }
        },
      });
  }

  private appendRefreshEvent(user: AuthUser, auditContext?: AuthAuditContext): void {
    const actor: AuthenticatedLedgerActor = {
      userId: user.userId,
      actorType: user.actorType,
      tenantId: user.tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: user.userId,
          payload: {
            action: AuthLedgerEventAction.TOKEN_REFRESHED,
            username: user.username,
          },
        },
        actor,
        user.tenantId,
        this.resolveAuditContext(auditContext),
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record token refresh event', error);
          }
        },
      });
  }

  private appendServiceTokenEvent(
    record: ServiceTokenRecord,
    action: typeof AuthLedgerEventAction.SERVICE_TOKEN_CREATED | typeof AuthLedgerEventAction.SERVICE_TOKEN_REVOKED,
    auditContext?: AuthAuditContext,
  ): void {
    const actor: AuthenticatedLedgerActor = {
      userId: record.id,
      actorType: 'service',
      tenantId: record.tenantId,
    };

    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: record.id,
          payload: {
            action,
            name: record.name,
            permissions: record.permissions,
          },
        },
        actor,
        record.tenantId,
        this.resolveAuditContext(auditContext),
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error(`Failed to record ${action} event`, error);
          }
        },
      });
  }

  private resolveAuditContext(auditContext?: AuthAuditContext): AuthAuditContext {
    return {
      sourceIp: auditContext?.sourceIp ?? '127.0.0.1',
      userAgent: auditContext?.userAgent ?? 'auth-service',
      correlationId: auditContext?.correlationId,
    };
  }

  private appendRoleAssignmentEvent(
    assignedBy: AuthenticatedLedgerActor,
    updatedUser: UserRoleRecord,
    permissions: string[],
  ): void {
    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: updatedUser.userId,
          payload: {
            action: 'ROLE_ASSIGNMENT_UPDATED',
            assignedBy: assignedBy.userId,
            username: updatedUser.username,
            roles: updatedUser.roles,
            permissions,
            active: updatedUser.active,
          },
        },
        assignedBy,
        updatedUser.tenantId,
        {
          sourceIp: '127.0.0.1',
          userAgent: 'auth-service',
        },
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record role assignment event', error);
          }
        },
      });
  }

  private appendUserDeactivatedEvent(
    deactivatedBy: AuthenticatedLedgerActor,
    updatedUser: UserRoleRecord,
    reason?: string,
  ): void {
    this.ledgerEventsService
      .appendEvent(
        {
          type: 'LEDGER_EVENT' as const,
          subjectType: 'auth',
          subjectId: updatedUser.userId,
          payload: {
            action: 'USER_DEACTIVATED',
            deactivatedBy: deactivatedBy.userId,
            username: updatedUser.username,
            active: updatedUser.active,
            reason,
          },
        },
        deactivatedBy,
        updatedUser.tenantId,
        {
          sourceIp: '127.0.0.1',
          userAgent: 'auth-service',
        },
      )
      .subscribe({
        error: (error) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to record user deactivation event', error);
          }
        },
      });
  }
}
