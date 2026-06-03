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

export const AuditMetadataSchema = z.object({
  tenantId: z.string().uuid(),
  requestId: z.string(),
  correlationId: z.string().optional(),
  sourceIp: z.string().optional(),
  userAgent: z.string().optional(),
  payloadHash: z.string(),
  previousHash: z.string().optional(),
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

// Base DTO for all ledger events
const baseLedgerEventDto = {
  actorType: ActorTypeSchema,
  actorId: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  payload: z.record(z.string(), z.any()),
  metadata: AuditMetadataSchema,
};

// DTO for standard ledger events
const StandardLedgerEventDtoSchema = z.object({
  ...baseLedgerEventDto,
  type: z.literal('LEDGER_EVENT'),
});

// DTO for device ledger events (requires deviceId and deviceType)
const DeviceLedgerEventDtoSchema = z.object({
  ...baseLedgerEventDto,
  type: z.literal('DEVICE_LEDGER_EVENT'),
  deviceId: z.string().min(1, 'deviceId is required for DEVICE_LEDGER_EVENT'),
  deviceType: z.string().min(1, 'deviceType is required for DEVICE_LEDGER_EVENT'),
});

// Discriminated union for append DTO
export const AppendLedgerEventDtoSchema = z.discriminatedUnion('type', [
  StandardLedgerEventDtoSchema,
  DeviceLedgerEventDtoSchema,
]);
export type AppendLedgerEventDto = z.infer<typeof AppendLedgerEventDtoSchema>;
