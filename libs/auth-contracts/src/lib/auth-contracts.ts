import { z } from 'zod';
import {
  ActorTypeSchema,
  LedgerPermissionSchema,
} from '@true-north-ledger/ledger-contracts';

export const AuthActorTypeSchema = z.enum(['user', 'service', 'device', 'system']);

export const AuthPermissionSchema = z.enum([
  'admin',
  'ledger.read',
  'ledger.write',
  'ledger.audit',
  'proof.read',
  'proof.manage',
  'users.read',
  'roles.manage',
  'orders.read',
  'orders.write',
  'orders.status.write',
  'inventory.read',
  'inventory.write',
  'inventory.scan.write',
  'shipping.read',
  'shipping.write',
  'billing.read',
  'billing.write',
  'moderation.read',
  'moderation.write',
  'devices.read',
  'devices.manage',
  'device.events.write',
  'admin.override.write',
  'settings.read',
  'settings.write',
  'users.manage',
]);

const PermissionDependencies: ReadonlyArray<{
  permission: string;
  requires: string;
}> = [
  { permission: 'ledger.write', requires: 'ledger.read' },
  { permission: 'ledger.audit', requires: 'ledger.read' },
  { permission: 'proof.manage', requires: 'proof.read' },
  { permission: 'users.manage', requires: 'users.read' },
  { permission: 'roles.manage', requires: 'users.read' },
  { permission: 'orders.write', requires: 'orders.read' },
  { permission: 'orders.status.write', requires: 'orders.read' },
  { permission: 'inventory.write', requires: 'inventory.read' },
  { permission: 'inventory.scan.write', requires: 'inventory.read' },
  { permission: 'shipping.write', requires: 'shipping.read' },
  { permission: 'billing.write', requires: 'billing.read' },
  { permission: 'moderation.write', requires: 'moderation.read' },
  { permission: 'devices.manage', requires: 'devices.read' },
  { permission: 'device.events.write', requires: 'devices.read' },
  { permission: 'settings.write', requires: 'settings.read' },
];

export const PermissionCombinationSchema = z.array(z.string().min(1)).superRefine((permissions, context) => {
  const uniquePermissions = new Set(permissions);

  if (uniquePermissions.size !== permissions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Permissions must not contain duplicates',
    });
  }

  for (const { permission, requires } of PermissionDependencies) {
    if (uniquePermissions.has(permission) && !uniquePermissions.has(requires)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Permission ${permission} requires ${requires}`,
      });
    }
  }
});

export const NonEmptyPermissionCombinationSchema = PermissionCombinationSchema.refine(
  (permissions) => permissions.length > 0,
  {
    message: 'At least one permission is required',
  },
);

export const RoleNameSchema = z.enum([
  'admin',
  'auditor',
  'operations_manager',
  'inventory',
  'shipping',
  'billing',
  'moderator',
  'device_technician',
  'support',
  'viewer',
]);

export const JwtPayloadSchema = z.object({
  sub: z.string().min(1),
  actorType: AuthActorTypeSchema,
  tenantId: z.string().uuid(),
  roles: z.array(RoleNameSchema).optional(),
  permissions: PermissionCombinationSchema.optional(),
  username: z.string().min(1).optional(),
  tokenType: z.enum(['access', 'refresh']).optional(),
  jti: z.string().uuid().optional(),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
});

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthUserSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  actorType: AuthActorTypeSchema,
  tenantId: z.string().uuid(),
  roles: z.array(RoleNameSchema).optional(),
  permissions: PermissionCombinationSchema,
});

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: AuthUserSchema,
});

export const ServiceTokenCreateRequestSchema = z.object({
  name: z.string().min(1),
  permissions: NonEmptyPermissionCombinationSchema,
});

export const ServiceTokenCreateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  tenantId: z.string().uuid(),
  permissions: PermissionCombinationSchema,
  token: z.string().min(1),
  createdAt: z.string().datetime(),
  revoked: z.boolean(),
});

export const ServiceTokenRevokeRequestSchema = z.object({
  id: z.string().uuid(),
});

export const UserRoleAssignmentRequestSchema = z.object({
  roles: z.array(RoleNameSchema).nonempty(),
  username: z.string().min(1).optional(),
});

export const UserRoleAssignmentResponseSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  tenantId: z.string().uuid(),
  roles: z.array(RoleNameSchema),
  permissions: PermissionCombinationSchema,
  active: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const UserDeactivationRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const UserDeactivationResponseSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  tenantId: z.string().uuid(),
  active: z.boolean(),
  updatedAt: z.string().datetime(),
  reason: z.string().optional(),
});

export { ActorTypeSchema, LedgerPermissionSchema };
export type ActorType = z.infer<typeof ActorTypeSchema>;
export type LedgerPermission = z.infer<typeof LedgerPermissionSchema>;
export type AuthActorType = z.infer<typeof AuthActorTypeSchema>;
export type AuthPermission = z.infer<typeof AuthPermissionSchema>;
export type PermissionCombination = z.infer<typeof PermissionCombinationSchema>;
export type RoleName = z.infer<typeof RoleNameSchema>;
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ServiceTokenCreateRequest = z.infer<typeof ServiceTokenCreateRequestSchema>;
export type ServiceTokenCreateResponse = z.infer<typeof ServiceTokenCreateResponseSchema>;
export type ServiceTokenRevokeRequest = z.infer<typeof ServiceTokenRevokeRequestSchema>;
export type UserRoleAssignmentRequest = z.infer<typeof UserRoleAssignmentRequestSchema>;
export type UserRoleAssignmentResponse = z.infer<typeof UserRoleAssignmentResponseSchema>;
export type UserDeactivationRequest = z.infer<typeof UserDeactivationRequestSchema>;
export type UserDeactivationResponse = z.infer<typeof UserDeactivationResponseSchema>;
