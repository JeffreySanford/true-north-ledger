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

export const AppendLedgerEventDtoSchema = z.object({
  type: z.enum(['LEDGER_EVENT', 'DEVICE_LEDGER_EVENT']),
  actorType: ActorTypeSchema,
  actorId: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  payload: z.record(z.string(), z.any()),
  metadata: AuditMetadataSchema,
  deviceId: z.string().optional(),
  deviceType: z.string().optional(),
});
export type AppendLedgerEventDto = z.infer<typeof AppendLedgerEventDtoSchema>;
