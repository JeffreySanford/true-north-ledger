import { z } from 'zod';
import { LedgerEventResponseSchema } from '@true-north-ledger/ledger-contracts';

export * from '@true-north-ledger/ledger-contracts';
export {
	CreateInventoryItemRequestExample,
	CreateInventoryItemRequestSchema,
	InventoryErrorCodeSchema,
	InventoryAlertListResponseSchema,
	InventoryAlertSchema,
	InventoryAlertSeveritySchema,
	InventoryAlertTypeSchema,
	InventoryAnomalyListResponseSchema,
	InventoryAnomalyListRequestSchema,
	InventoryAnomalySchema,
	InventoryAnomalySeveritySchema,
	InventoryAnomalyStatusSchema,
	InventoryAnomalyTypeSchema,
	InventoryBulkMoveRequestSchema,
	InventoryBulkMoveResponseSchema,
	InventoryBulkMoveResultSchema,
	InventoryExpiredReservationReleaseResponseSchema,
	InventoryImportRequestSchema,
	InventoryImportResponseSchema,
	InventoryImportResultSchema,
	InventoryItemExample,
	InventoryItemSchema,
	InventoryLedgerEventAction,
	InventoryLedgerEventActionSchema,
	InventoryListRequestSchema,
	InventoryListResponseSchema,
	InventoryOperationTypeSchema,
	InventoryProvenanceEventSchema,
	InventoryProvenanceResponseSchema,
	InventoryMoveRequestSchema,
	InventoryQuantityAdjustmentRequestSchema,
	InventoryRemovalRequestSchema,
	InventoryScanRequestSchema,
	InventoryScanTypeSchema,
	InventoryReservationReleaseRequestSchema,
	InventoryReservationRequestSchema,
	InventoryStatusChangeRequestSchema,
	InventoryStatus,
	InventoryStatusSchema,
	type CreateInventoryItemRequest,
	type InventoryErrorCode,
	type InventoryAlert,
	type InventoryAlertListResponse,
	type InventoryAlertSeverity,
	type InventoryAlertType,
	type InventoryAnomaly,
	type InventoryAnomalyListRequest,
	type InventoryAnomalyListResponse,
	type InventoryAnomalySeverity,
	type InventoryAnomalyStatus,
	type InventoryAnomalyType,
	type InventoryBulkMoveRequest,
	type InventoryBulkMoveResponse,
	type InventoryBulkMoveResult,
	type InventoryExpiredReservationReleaseResponse,
	type InventoryImportRequest,
	type InventoryImportResponse,
	type InventoryImportResult,
	type InventoryItem,
	type InventoryLedgerEventAction as InventoryAction,
	type InventoryListRequest,
	type InventoryListResponse,
	type InventoryOperationType,
	type InventoryProvenanceEvent,
	type InventoryProvenanceResponse,
	type InventoryMoveRequest,
	type InventoryQuantityAdjustmentRequest,
	type InventoryRemovalRequest,
	type InventoryScanRequest,
	type InventoryScanType,
	type InventoryReservationReleaseRequest,
	type InventoryReservationRequest,
	type InventoryStatusChangeRequest,
	type InventoryStatus as InventoryLifecycleStatus,
} from '@true-north-ledger/inventory-contracts';
export {
	CreateOrderRequestExample,
	CreateOrderRequestSchema,
	OrderAddressSchema,
	OrderActorMetadataSchema,
	OrderCancelRequestSchema,
	OrderDetailResponseSchema,
	OrderErrorCodeSchema,
	OrderErrorSchema,
	OrderExample,
	OrderItemSchema,
	OrderLedgerEventAction,
	OrderLedgerEventActionSchema,
	OrderListResponseSchema,
	OrderProofSchema,
	OrderProofVerificationRequestSchema,
	OrderProofVerificationResponseSchema,
	OrderSchema,
	OrderSearchRequestSchema,
	OrderStatus,
	OrderStatusSchema,
	OrderStatusUpdateRequestSchema,
	OrderSummarySchema,
	OrderTimelineEventSchema,
	type CreateOrderRequest,
	type Order,
	type OrderAddress,
	type OrderActorMetadata,
	type OrderCancelRequest,
	type OrderDetailResponse,
	type OrderError,
	type OrderErrorCode,
	type OrderItem,
	type OrderLedgerEventAction as OrderAction,
	type OrderListResponse,
	type OrderProof,
	type OrderProofVerificationRequest,
	type OrderProofVerificationResponse,
	type OrderSearchRequest,
	type OrderStatus as OrderLifecycleStatus,
	type OrderStatusUpdateRequest,
	type OrderSummary,
	type OrderTimelineEvent,
} from '@true-north-ledger/order-contracts';
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

export const NotificationPrioritySchema = z.enum(['high', 'normal', 'low']);
export const NotificationCategorySchema = z.enum([
	'ledger',
	'order',
	'inventory',
	'device',
	'anomaly',
	'system',
]);
export const NotificationEventTypeSchema = z.enum([
	'LEDGER_EVENT_CREATED',
	'ORDER_STATUS_CHANGED',
	'INVENTORY_LOW_STOCK',
	'DEVICE_HEARTBEAT_MISSED',
	'ANOMALY_DETECTED',
	'SYSTEM_ALERT',
]);

const BaseNotificationSchema = z.object({
	event: NotificationEventTypeSchema,
	priority: NotificationPrioritySchema,
	category: NotificationCategorySchema,
	occurredAt: z.string().datetime(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LedgerNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('LEDGER_EVENT_CREATED'),
	category: z.literal('ledger'),
	ledgerEvent: LedgerEventResponseSchema,
});

export const OrderStatusNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('ORDER_STATUS_CHANGED'),
	category: z.literal('order'),
	orderId: z.string().min(1),
	orderNumber: z.string().min(1).optional(),
	status: z.string().min(1),
	previousStatus: z.string().min(1).optional(),
	reason: z.string().min(1).optional(),
});

export const InventoryLowStockNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('INVENTORY_LOW_STOCK'),
	category: z.literal('inventory'),
	itemId: z.string().min(1),
	sku: z.string().min(1),
	quantity: z.number().nonnegative(),
	threshold: z.number().nonnegative(),
	locationId: z.string().min(1).optional(),
});

export const DeviceHeartbeatMissedNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('DEVICE_HEARTBEAT_MISSED'),
	category: z.literal('device'),
	deviceId: z.string().min(1),
	lastHeartbeatAt: z.string().datetime().optional(),
	missedSince: z.string().datetime(),
});

export const AnomalyDetectedNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('ANOMALY_DETECTED'),
	category: z.literal('anomaly'),
	anomalyId: z.string().min(1),
	anomalyType: z.string().min(1),
	severity: z.string().min(1),
	message: z.string().min(1),
	subjectType: z.string().min(1).optional(),
	subjectId: z.string().min(1).optional(),
});

export const SystemAlertNotificationSchema = BaseNotificationSchema.extend({
	event: z.literal('SYSTEM_ALERT'),
	category: z.literal('system'),
	code: z.string().min(1),
	message: z.string().min(1),
	service: z.string().min(1).optional(),
});

export const AppNotificationSchema = z.discriminatedUnion('event', [
	LedgerNotificationSchema,
	OrderStatusNotificationSchema,
	InventoryLowStockNotificationSchema,
	DeviceHeartbeatMissedNotificationSchema,
	AnomalyDetectedNotificationSchema,
	SystemAlertNotificationSchema,
]);

export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;
export type LedgerNotification = z.infer<typeof LedgerNotificationSchema>;
export type OrderStatusNotification = z.infer<typeof OrderStatusNotificationSchema>;
export type InventoryLowStockNotification = z.infer<typeof InventoryLowStockNotificationSchema>;
export type DeviceHeartbeatMissedNotification = z.infer<typeof DeviceHeartbeatMissedNotificationSchema>;
export type AnomalyDetectedNotification = z.infer<typeof AnomalyDetectedNotificationSchema>;
export type SystemAlertNotification = z.infer<typeof SystemAlertNotificationSchema>;
export type AppNotification = z.infer<typeof AppNotificationSchema>;
