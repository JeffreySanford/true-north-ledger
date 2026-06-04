import { z } from 'zod';

export const ActorTypeSchema = z.enum([
  'user',
  'device',
  'system',
  'admin',
  'service',
]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const LedgerPermissionSchema = z.enum([
  'read',
  'write',
  'admin',
  'audit',
]);
export type LedgerPermission = z.infer<typeof LedgerPermissionSchema>;

export const EventResultSchema = z.enum(['accepted', 'rejected', 'failed']);
export type EventResult = z.infer<typeof EventResultSchema>;

export const AuthLedgerEventActionSchema = z.enum([
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'TOKEN_REFRESHED',
  'SERVICE_TOKEN_CREATED',
  'SERVICE_TOKEN_REVOKED',
  'PERMISSION_DENIED',
  'RATE_LIMIT_EXCEEDED',
]);
export const AuthLedgerEventAction = AuthLedgerEventActionSchema.enum;
export type AuthLedgerEventAction = z.infer<typeof AuthLedgerEventActionSchema>;

export const AuthLedgerEventPayloadSchema = z.object({
  action: AuthLedgerEventActionSchema,
}).catchall(z.unknown());
export type AuthLedgerEventPayload = z.infer<typeof AuthLedgerEventPayloadSchema>;

export const AuditMetadataSchema = z.object({
  tenantId: z.string().uuid(),
  requestId: z.string(),
  correlationId: z.string().optional(),
  sourceIp: z.string().optional(),
  userAgent: z.string().optional(),
  payloadHash: z.string(),
  previousHash: z.string().optional(),
  eventHash: z.string(),
  chainSequence: z.number().int().positive(),
  result: EventResultSchema,
  timestamp: z.string().datetime(),
});
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;

const ledgerEventBase = {
  id: z.string().uuid(),
  type: z.string(),
  actorType: ActorTypeSchema,
  actorId: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  payload: z.record(z.string(), z.any()),
  metadata: AuditMetadataSchema,
  createdAt: z.string().datetime(),
};

export const LedgerEventSchema = z.object({
  ...ledgerEventBase,
  type: z.literal('LEDGER_EVENT'),
});
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export const AuthLedgerEventSchema = LedgerEventSchema.extend({
  subjectType: z.literal('auth'),
  payload: AuthLedgerEventPayloadSchema,
});
export type AuthLedgerEvent = z.infer<typeof AuthLedgerEventSchema>;

export const DeviceLedgerEventSchema = z.object({
  ...ledgerEventBase,
  type: z.literal('DEVICE_LEDGER_EVENT'),
  deviceId: z.string(),
  deviceType: z.string(),
});
export type DeviceLedgerEvent = z.infer<typeof DeviceLedgerEventSchema>;

export const LedgerEventResponseSchema = z.discriminatedUnion('type', [
  LedgerEventSchema,
  DeviceLedgerEventSchema,
]);
export type LedgerEventResponse = z.infer<typeof LedgerEventResponseSchema>;

export const LedgerChainVerificationResponseSchema = z.object({
  tenantId: z.string().uuid(),
  valid: z.boolean(),
  checkedEvents: z.number().int().nonnegative(),
  headHash: z.string().optional(),
  failures: z.array(
    z.object({
      eventId: z.string().uuid(),
      chainSequence: z.number().int().positive(),
      reason: z.string(),
    }),
  ),
});
export type LedgerChainVerificationResponse = z.infer<
  typeof LedgerChainVerificationResponseSchema
>;

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().positive(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// Base DTO for client requests - only business data, no audit metadata
const baseLedgerEventDto = {
  subjectType: z.string().min(1, 'subjectType is required'),
  subjectId: z.string().min(1, 'subjectId is required'),
  payload: z.record(z.string(), z.any()),
};

// DTO for standard ledger events
const StandardLedgerEventDtoSchema = z.object({
  ...baseLedgerEventDto,
  type: z.literal('LEDGER_EVENT'),
}).strict();

// DTO for device ledger events (requires deviceId and deviceType)
const DeviceLedgerEventDtoSchema = z.object({
  ...baseLedgerEventDto,
  type: z.literal('DEVICE_LEDGER_EVENT'),
  deviceId: z.string().min(1, 'deviceId is required for DEVICE_LEDGER_EVENT'),
  deviceType: z.string().min(1, 'deviceType is required for DEVICE_LEDGER_EVENT'),
}).strict();

// Discriminated union for append DTO
export const AppendLedgerEventDtoSchema = z.discriminatedUnion('type', [
  StandardLedgerEventDtoSchema,
  DeviceLedgerEventDtoSchema,
]);
export type AppendLedgerEventDto = z.infer<typeof AppendLedgerEventDtoSchema>;
