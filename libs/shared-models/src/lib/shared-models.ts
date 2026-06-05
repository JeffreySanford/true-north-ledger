import { z } from 'zod';

export * from '@true-north-ledger/ledger-contracts';
export {
	DeviceTypeSchema,
	DeviceStatusSchema,
	DevicePermissionSchema,
	DeviceLedgerEventActionSchema,
	DeviceLedgerEventAction,
	DeviceRegistrationRequestSchema,
	DeviceProvisioningPayloadSchema,
	DeviceSchema,
	DeviceRegistrationResponseSchema,
	DeviceListResponseSchema,
	DeviceStatusUpdateRequestSchema,
	DeviceHeartbeatRequestSchema,
	DeviceHeartbeatResponseSchema,
	DeviceEventRequestSchema,
	DeviceBatchEventRequestSchema,
	DeviceEventIngestResponseSchema,
	DeviceBatchEventResultSchema,
	DeviceBatchEventIngestResponseSchema,
	DeviceHardwareExamples,
	DeviceErrorCodeSchema,
	DeviceErrorSchema,
	type DeviceType,
	type DeviceStatus,
	type DevicePermission,
	type DeviceLedgerEventAction as DeviceAction,
	type DeviceRegistrationRequest,
	type DeviceProvisioningPayload,
	type Device,
	type DeviceRegistrationResponse,
	type DeviceListResponse,
	type DeviceStatusUpdateRequest,
	type DeviceHeartbeatRequest,
	type DeviceHeartbeatResponse,
	type DeviceEventRequest,
	type DeviceBatchEventRequest,
	type DeviceEventIngestResponse,
	type DeviceBatchEventResult,
	type DeviceBatchEventIngestResponse,
	type DeviceHardwareExample,
	type DeviceErrorCode,
	type DeviceError,
} from '@true-north-ledger/device-contracts';

export const PermissionSchema = z
	.string()
	.min(1)
	.regex(/^[a-z]+(?:\.[a-z]+)*$/, 'Permission names must use dot-case segments.');

export const RoleNameSchema = z
	.string()
	.min(1)
	.regex(/^[a-z]+(?:_[a-z]+)*$/, 'Role names must use snake_case.');

export const RoleSchema = z.object({
	name: RoleNameSchema,
	permissions: z.array(PermissionSchema),
});

export const UserSchema = z.object({
	userId: z.string().min(1),
	username: z.string().min(1),
	actorType: z.enum(['user', 'service', 'device', 'system']),
	tenantId: z.string().uuid(),
	roles: z.array(RoleNameSchema).optional(),
	permissions: z.array(PermissionSchema),
	active: z.boolean().optional(),
});

export type Permission = z.infer<typeof PermissionSchema>;
export type RoleName = z.infer<typeof RoleNameSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type User = z.infer<typeof UserSchema>;

export const AuthErrorCodeSchema = z.enum([
	'AUTH_INVALID_CREDENTIALS',
	'AUTH_UNAUTHORIZED',
	'AUTH_FORBIDDEN',
	'AUTH_RATE_LIMITED',
	'AUTH_TOKEN_INVALID',
	'AUTH_TOKEN_EXPIRED',
]);

export const AuthErrorSchema = z.object({
	statusCode: z.number().int().min(400).max(599),
	message: z.string().min(1),
	error: z.string().min(1),
	code: AuthErrorCodeSchema,
	details: z.record(z.string(), z.unknown()).optional(),
});

export const RateLimitErrorSchema = AuthErrorSchema.extend({
	statusCode: z.literal(429),
	code: z.literal('AUTH_RATE_LIMITED'),
	retryAfterSeconds: z.number().int().positive().optional(),
});

export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;
export type AuthError = z.infer<typeof AuthErrorSchema>;
export type RateLimitError = z.infer<typeof RateLimitErrorSchema>;

export const ServiceTokenSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	tenantId: z.string().uuid(),
	permissions: z.array(z.string().min(1)),
	token: z.string().min(1).optional(),
	createdAt: z.string().datetime(),
	revoked: z.boolean(),
	revokedAt: z.string().datetime().optional(),
});

export type ServiceToken = z.infer<typeof ServiceTokenSchema>;
