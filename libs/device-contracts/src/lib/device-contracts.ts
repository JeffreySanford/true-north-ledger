import { z } from 'zod';
import { DeviceLedgerEventSchema } from '@true-north-ledger/ledger-contracts';

export const DEVICE_EVENT_PAYLOAD_MAX_BYTES = 16 * 1024;
export const DEVICE_BATCH_PAYLOAD_MAX_BYTES = 64 * 1024;

export const DeviceTypeSchema = z.enum(['scanner', 'printer', 'sensor', 'kiosk', 'gateway', 'tablet']);
export const DeviceStatusSchema = z.enum(['active', 'inactive', 'revoked', 'suspended']);
export const DevicePermissionSchema = z.enum([
  'device.heartbeat.write',
  'device.events.write',
  'device.status.read',
]);

export const DeviceLedgerEventActionSchema = z.enum([
  'DEVICE_REGISTERED',
  'DEVICE_AUTH_SUCCESS',
  'DEVICE_AUTH_FAILED',
  'DEVICE_HEARTBEAT',
  'DEVICE_STATUS_CHANGED',
  'DEVICE_AUTO_SUSPENDED',
  'DEVICE_REVOKED',
  'DEVICE_EVENT_RECEIVED',
  'REPLAY_ATTACK_DETECTED',
]);
export const DeviceLedgerEventAction = DeviceLedgerEventActionSchema.enum;

const DeviceMetadataSchema = z.record(z.string(), z.unknown());

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export const DeviceRegistrationRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: DeviceTypeSchema,
  permissions: z.array(DevicePermissionSchema).optional(),
  metadata: DeviceMetadataSchema.optional(),
});

export const DeviceProvisioningPayloadSchema = z.object({
  version: z.literal(1),
  deviceId: z.string().uuid(),
  deviceName: z.string().min(1),
  deviceType: DeviceTypeSchema,
  tenantId: z.string().uuid(),
  apiKey: z.string().min(1),
  heartbeatPath: z.literal('/api/v1/devices/heartbeat'),
  deviceEventPath: z.literal('/api/v1/device-events'),
  batchDeviceEventPath: z.literal('/api/v1/device-events/batch'),
  issuedAt: z.string().datetime(),
});

export const DeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: DeviceTypeSchema,
  tenantId: z.string().uuid(),
  status: DeviceStatusSchema,
  permissions: z.array(DevicePermissionSchema),
  metadata: DeviceMetadataSchema,
  lastSeenAt: z.string().datetime().nullable(),
  online: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  provisioningPayloadVersion: z.number().int().positive().optional(),
  lastProvisionedAt: z.string().datetime().nullable().optional(),
  heartbeatFailureCount: z.number().int().nonnegative().optional(),
  autoSuspendedAt: z.string().datetime().nullable().optional(),
});

export const DeviceRegistrationResponseSchema = DeviceSchema.extend({
  apiKey: z.string().min(1),
  provisioningPayload: DeviceProvisioningPayloadSchema,
  provisioningUri: z.string().min(1),
});

export const DeviceListResponseSchema = z.object({
  devices: z.array(DeviceSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
});

export const DeviceStatusUpdateRequestSchema = z.object({
  status: DeviceStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export const DeviceHeartbeatRequestSchema = z.object({
  status: z.enum(['online', 'degraded']).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
});

export const DeviceHeartbeatResponseSchema = z.object({
  deviceId: z.string().uuid(),
  status: DeviceStatusSchema,
  serverTimestamp: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});

export const DeviceEventRequestSchema = z.object({
  eventType: z.string().trim().min(1).max(100),
  timestamp: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
  nonce: z.string().trim().min(1).max(200).optional(),
}).superRefine((request, context) => {
  const payloadBytes = jsonByteLength(request.payload);
  if (payloadBytes > DEVICE_EVENT_PAYLOAD_MAX_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload'],
      message: `Device event payload must be ${DEVICE_EVENT_PAYLOAD_MAX_BYTES} bytes or less.`,
    });
  }
});

export const DeviceBatchEventRequestSchema = z.object({
  events: z.array(DeviceEventRequestSchema).min(1).max(100),
}).superRefine((request, context) => {
  const payloadBytes = request.events.reduce((total, event) => total + jsonByteLength(event.payload), 0);
  if (payloadBytes > DEVICE_BATCH_PAYLOAD_MAX_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['events'],
      message: `Device batch event payloads must total ${DEVICE_BATCH_PAYLOAD_MAX_BYTES} bytes or less.`,
    });
  }
});

export const DeviceEventIngestResponseSchema = z.object({
  eventId: z.string().uuid(),
  serverTimestamp: z.string().datetime(),
  nonce: z.string().min(1).optional(),
});

export const DeviceBatchEventResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  eventId: z.string().uuid().optional(),
  serverTimestamp: z.string().datetime().optional(),
  nonce: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export const DeviceBatchEventIngestResponseSchema = z.object({
  results: z.array(DeviceBatchEventResultSchema),
});

export const DeviceBatchEventRequestExample = DeviceBatchEventRequestSchema.parse({
  events: [
    {
      eventType: 'SCAN_RECEIVED',
      timestamp: '2026-06-04T12:00:00.000Z',
      payload: { sku: 'SKU-100', quantity: 1, station: 'dock-a' },
      nonce: 'scanner-17-000001',
    },
    {
      eventType: 'SCAN_CONFIRMED',
      timestamp: '2026-06-04T12:00:01.500Z',
      payload: { sku: 'SKU-100', accepted: true, operatorId: 'op-42' },
      nonce: 'scanner-17-000002',
    },
  ],
});

export const DeviceBatchEventIngestResponseExample = DeviceBatchEventIngestResponseSchema.parse({
  results: [
    {
      index: 0,
      success: true,
      eventId: '11111111-1111-4111-8111-111111111111',
      serverTimestamp: '2026-06-04T12:00:00.221Z',
    },
    {
      index: 1,
      success: true,
      eventId: '22222222-2222-4222-8222-222222222222',
      serverTimestamp: '2026-06-04T12:00:01.744Z',
    },
  ],
});

export const DeviceHardwareExamples = {
  scanner: {
    useCase: 'Receiving dock barcode scans that confirm SKU, quantity, and station.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Receiving scanner 01',
      type: 'scanner',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'receiving', station: 'dock-a', model: 'Zebra TC52' },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'inventory.scan',
      timestamp: '2026-06-04T12:10:00.000Z',
      payload: { sku: 'SKU-001', quantity: 4, barcode: '012345678905', station: 'dock-a' },
      nonce: 'scanner-01-000001',
    }),
  },
  printer: {
    useCase: 'Label printer status and print-completion events for shipping labels.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Shipping label printer 02',
      type: 'printer',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'shipping', station: 'pack-2', media: '4x6-label' },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'label.printed',
      timestamp: '2026-06-04T12:11:00.000Z',
      payload: { labelId: 'LBL-1001', orderId: 'ORD-9001', carrier: 'ups', station: 'pack-2' },
      nonce: 'printer-02-000001',
    }),
  },
  sensor: {
    useCase: 'Environmental monitoring for cold-chain or high-value inventory.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Cold room sensor 03',
      type: 'sensor',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'cold-room', measurement: 'temperature', unit: 'fahrenheit' },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'environment.temperature',
      timestamp: '2026-06-04T12:12:00.000Z',
      payload: { temperature: 37.8, humidity: 42, thresholdExceeded: false },
      nonce: 'sensor-03-000001',
    }),
  },
  kiosk: {
    useCase: 'Self-service receiving, pickup, or returns station actions.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Returns kiosk 04',
      type: 'kiosk',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'front-counter', workflow: 'returns' },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'kiosk.return.accepted',
      timestamp: '2026-06-04T12:13:00.000Z',
      payload: { returnId: 'RET-1201', orderId: 'ORD-8801', accepted: true },
      nonce: 'kiosk-04-000001',
    }),
  },
  gateway: {
    useCase: 'Edge gateway forwarding summarized events from downstream devices.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Dock gateway 05',
      type: 'gateway',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'receiving', protocol: 'mqtt-bridge', downstreamDevices: 12 },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'gateway.batch.summary',
      timestamp: '2026-06-04T12:14:00.000Z',
      payload: { forwarded: 48, failed: 0, windowSeconds: 60 },
      nonce: 'gateway-05-000001',
    }),
  },
  tablet: {
    useCase: 'Supervisor or mobile operations tablet recording workflow decisions.',
    registration: DeviceRegistrationRequestSchema.parse({
      name: 'Supervisor tablet 06',
      type: 'tablet',
      permissions: ['device.heartbeat.write', 'device.events.write', 'device.status.read'],
      metadata: { zone: 'floor', role: 'supervisor', appVersion: '2.1.0' },
    }),
    event: DeviceEventRequestSchema.parse({
      eventType: 'workflow.approval',
      timestamp: '2026-06-04T12:15:00.000Z',
      payload: { workflowId: 'WF-7001', approved: true, reason: 'cycle-count-match' },
      nonce: 'tablet-06-000001',
    }),
  },
} as const;

export const DeviceErrorCodeSchema = z.enum([
  'DEVICE_INVALID_REQUEST',
  'DEVICE_UNAUTHORIZED',
  'DEVICE_FORBIDDEN',
  'DEVICE_NOT_FOUND',
  'DEVICE_CONFLICT',
  'DEVICE_REPLAY_DETECTED',
]);

export const DeviceErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  message: z.string().min(1),
  error: z.string().min(1).optional(),
  code: DeviceErrorCodeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export { DeviceLedgerEventSchema };
export type DeviceType = z.infer<typeof DeviceTypeSchema>;
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;
export type DevicePermission = z.infer<typeof DevicePermissionSchema>;
export type DeviceLedgerEventAction = z.infer<typeof DeviceLedgerEventActionSchema>;
export type DeviceRegistrationRequest = z.infer<typeof DeviceRegistrationRequestSchema>;
export type DeviceProvisioningPayload = z.infer<typeof DeviceProvisioningPayloadSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type DeviceRegistrationResponse = z.infer<typeof DeviceRegistrationResponseSchema>;
export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;
export type DeviceStatusUpdateRequest = z.infer<typeof DeviceStatusUpdateRequestSchema>;
export type DeviceHeartbeatRequest = z.infer<typeof DeviceHeartbeatRequestSchema>;
export type DeviceHeartbeatResponse = z.infer<typeof DeviceHeartbeatResponseSchema>;
export type DeviceEventRequest = z.infer<typeof DeviceEventRequestSchema>;
export type DeviceBatchEventRequest = z.infer<typeof DeviceBatchEventRequestSchema>;
export type DeviceEventIngestResponse = z.infer<typeof DeviceEventIngestResponseSchema>;
export type DeviceBatchEventResult = z.infer<typeof DeviceBatchEventResultSchema>;
export type DeviceBatchEventIngestResponse = z.infer<typeof DeviceBatchEventIngestResponseSchema>;
export type DeviceHardwareExample = (typeof DeviceHardwareExamples)[keyof typeof DeviceHardwareExamples];
export type DeviceErrorCode = z.infer<typeof DeviceErrorCodeSchema>;
export type DeviceError = z.infer<typeof DeviceErrorSchema>;
export type DeviceLedgerEvent = z.infer<typeof DeviceLedgerEventSchema>;
