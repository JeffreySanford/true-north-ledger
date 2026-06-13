import { z } from 'zod';

const MetadataSchema = z.record(z.string(), z.unknown());

export const InventoryStatusSchema = z.enum([
  'available',
  'reserved',
  'in_transit',
  'damaged',
  'expired',
  'removed',
]);
export const InventoryStatus = InventoryStatusSchema.enum;

export const InventoryLedgerEventActionSchema = z.enum([
  'INVENTORY_ADDED',
  'INVENTORY_RESERVED',
  'INVENTORY_RESERVATION_RELEASED',
  'INVENTORY_MOVED',
  'INVENTORY_REMOVED',
  'INVENTORY_SCANNED',
  'INVENTORY_QUANTITY_ADJUSTED',
  'INVENTORY_STATUS_CHANGED',
  'INVENTORY_ANOMALY_DETECTED',
  'INVENTORY_ANOMALY',
  'INVENTORY_LOW_STOCK',
  'INVENTORY_EXPIRING_SOON',
]);
export const InventoryLedgerEventAction = InventoryLedgerEventActionSchema.enum;

export const CreateInventoryItemRequestSchema = z.object({
  sku: z.string().trim().min(1).max(80).transform((sku) => sku.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  locationId: z.string().trim().min(1).max(120),
  locationName: z.string().trim().min(1).max(160),
  quantity: z.number().int().nonnegative(),
  unitOfMeasure: z.string().trim().min(1).max(40),
  batchNumber: z.string().trim().min(1).max(120).optional(),
  serialNumber: z.string().trim().min(1).max(160).optional(),
  expirationDate: z.string().date().optional(),
  metadata: MetadataSchema.optional(),
});

export const InventoryReservationRequestSchema = z.object({
  quantity: z.number().int().positive(),
  orderId: z.string().uuid().optional(),
});

export const InventoryReservationReleaseRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const InventoryMoveRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(120),
  locationName: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const InventoryRemovalRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const InventoryScanTypeSchema = z.enum(['barcode', 'qr', 'rfid', 'manual']);

export const InventoryScanRequestSchema = z.object({
  value: z.string().trim().min(1).max(160),
  scanType: InventoryScanTypeSchema,
  locationId: z.string().trim().min(1).max(120).optional(),
});

export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  tenantId: z.string().uuid(),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  reservationOrderId: z.string().uuid().nullable(),
  unitOfMeasure: z.string().min(1),
  status: InventoryStatusSchema,
  batchNumber: z.string().nullable(),
  serialNumber: z.string().nullable(),
  expirationDate: z.string().date().nullable(),
  metadata: MetadataSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastScannedAt: z.string().datetime().nullable(),
  removalReason: z.string().nullable(),
  removedAt: z.string().datetime().nullable(),
});

export const InventoryListRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(120).optional(),
  status: InventoryStatusSchema.optional(),
  query: z.string().trim().min(1).max(160).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  sortBy: z.enum(['quantity', 'lastScannedAt', 'createdAt']).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

export const InventoryListResponseSchema = z.object({
  items: z.array(InventoryItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const InventoryProvenanceEventSchema = z.object({
  eventId: z.string().uuid(),
  action: InventoryLedgerEventActionSchema,
  actorType: z.string().min(1),
  actorId: z.string().min(1),
  deviceId: z.string().nullable(),
  deviceType: z.string().nullable(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  quantity: z.number().int().nonnegative().nullable(),
  reservedQuantity: z.number().int().nonnegative().nullable(),
  details: MetadataSchema,
  timestamp: z.string().datetime(),
  chainSequence: z.number().int().positive(),
  eventHash: z.string().min(1),
});

export const InventoryProvenanceResponseSchema = z.object({
  item: InventoryItemSchema,
  events: z.array(InventoryProvenanceEventSchema),
});

export const InventoryAnomalyTypeSchema = z.enum([
  'low_stock',
  'missing_scan',
  'expired',
  'damaged_not_removed',
]);
export const InventoryAnomalySeveritySchema = z.enum(['warning', 'error', 'critical']);
export const InventoryAnomalyStatusSchema = z.enum(['open', 'resolved']);

export const InventoryAnomalySchema = z.object({
  id: z.string().min(1),
  itemId: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  type: InventoryAnomalyTypeSchema,
  severity: InventoryAnomalySeveritySchema,
  status: InventoryAnomalyStatusSchema,
  message: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  detectedAt: z.string().datetime(),
  remediation: z.string().min(1),
  details: MetadataSchema,
});

export const InventoryAnomalyListResponseSchema = z.object({
  anomalies: z.array(InventoryAnomalySchema),
  total: z.number().int().nonnegative(),
});

export const InventoryAlertTypeSchema = z.enum([
  'low_stock',
  'expiring_soon',
  'anomaly',
]);
export const InventoryAlertSeveritySchema = InventoryAnomalySeveritySchema;

export const InventoryAlertSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  type: InventoryAlertTypeSchema,
  severity: InventoryAlertSeveritySchema,
  message: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  createdAt: z.string().datetime(),
  action: z.string().min(1),
  details: MetadataSchema,
});

export const InventoryAlertListResponseSchema = z.object({
  alerts: z.array(InventoryAlertSchema),
  total: z.number().int().nonnegative(),
});

export const InventoryErrorCodeSchema = z.enum([
  'INVENTORY_INVALID_REQUEST',
  'INVENTORY_NOT_FOUND',
  'INVENTORY_CONFLICT',
  'INVENTORY_FORBIDDEN',
]);

export const CreateInventoryItemRequestExample = CreateInventoryItemRequestSchema.parse({
  sku: 'SKU-100',
  name: 'Serialized sensor kit',
  description: 'Warehouse sensor kit with serialized components',
  locationId: 'AUSTIN-A1',
  locationName: 'Austin Warehouse - Aisle A1',
  quantity: 25,
  unitOfMeasure: 'each',
  batchNumber: 'LOT-42',
  serialNumber: 'SNS-100-001',
  expirationDate: '2027-06-30',
  metadata: { source: 'api' },
});

export const InventoryItemExample = InventoryItemSchema.parse({
  id: '55555555-5555-4555-8555-555555555555',
  ...CreateInventoryItemRequestExample,
  tenantId: '11111111-1111-4111-8111-111111111111',
  description: CreateInventoryItemRequestExample.description ?? '',
  reservedQuantity: 0,
  reservationOrderId: null,
  status: 'available',
  batchNumber: CreateInventoryItemRequestExample.batchNumber ?? null,
  serialNumber: CreateInventoryItemRequestExample.serialNumber ?? null,
  expirationDate: CreateInventoryItemRequestExample.expirationDate ?? null,
  metadata: CreateInventoryItemRequestExample.metadata ?? {},
  createdAt: '2026-06-11T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  lastScannedAt: null,
  removalReason: null,
  removedAt: null,
});

export type InventoryStatus = z.infer<typeof InventoryStatusSchema>;
export type InventoryLedgerEventAction = z.infer<typeof InventoryLedgerEventActionSchema>;
export type CreateInventoryItemRequest = z.infer<typeof CreateInventoryItemRequestSchema>;
export type InventoryReservationRequest = z.infer<typeof InventoryReservationRequestSchema>;
export type InventoryReservationReleaseRequest = z.infer<typeof InventoryReservationReleaseRequestSchema>;
export type InventoryMoveRequest = z.infer<typeof InventoryMoveRequestSchema>;
export type InventoryRemovalRequest = z.infer<typeof InventoryRemovalRequestSchema>;
export type InventoryScanType = z.infer<typeof InventoryScanTypeSchema>;
export type InventoryScanRequest = z.infer<typeof InventoryScanRequestSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryListRequest = z.infer<typeof InventoryListRequestSchema>;
export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;
export type InventoryProvenanceEvent = z.infer<typeof InventoryProvenanceEventSchema>;
export type InventoryProvenanceResponse = z.infer<typeof InventoryProvenanceResponseSchema>;
export type InventoryAnomalyType = z.infer<typeof InventoryAnomalyTypeSchema>;
export type InventoryAnomalySeverity = z.infer<typeof InventoryAnomalySeveritySchema>;
export type InventoryAnomalyStatus = z.infer<typeof InventoryAnomalyStatusSchema>;
export type InventoryAnomaly = z.infer<typeof InventoryAnomalySchema>;
export type InventoryAnomalyListResponse = z.infer<typeof InventoryAnomalyListResponseSchema>;
export type InventoryAlertType = z.infer<typeof InventoryAlertTypeSchema>;
export type InventoryAlertSeverity = z.infer<typeof InventoryAlertSeveritySchema>;
export type InventoryAlert = z.infer<typeof InventoryAlertSchema>;
export type InventoryAlertListResponse = z.infer<typeof InventoryAlertListResponseSchema>;
export type InventoryErrorCode = z.infer<typeof InventoryErrorCodeSchema>;
