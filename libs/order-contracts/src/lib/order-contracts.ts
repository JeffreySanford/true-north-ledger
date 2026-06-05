import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'failed',
]);
export const OrderStatus = OrderStatusSchema.enum;

export const OrderLedgerEventActionSchema = z.enum([
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_CONFIRMED',
  'ORDER_PROCESSING',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'ORDER_PAYMENT_RECEIVED',
  'ORDER_REFUND_ISSUED',
]);
export const OrderLedgerEventAction = OrderLedgerEventActionSchema.enum;

const CurrencySchema = z.string().trim().length(3).transform((currency) => currency.toUpperCase());
const MetadataSchema = z.record(z.string(), z.unknown());
const MoneyAmountSchema = z.number().nonnegative().finite();

export const OrderItemSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  quantity: z.number().int().positive(),
  unitPrice: MoneyAmountSchema,
  metadata: MetadataSchema.optional(),
});

export const OrderAddressSchema = z.object({
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(40),
  country: z.string().trim().length(2).transform((country) => country.toUpperCase()),
});

export const CreateOrderRequestSchema = z.object({
  customerId: z.string().trim().min(1).max(120),
  customerName: z.string().trim().min(1).max(160),
  customerEmail: z.string().trim().email().max(254).optional(),
  items: z.array(OrderItemSchema).min(1).max(100),
  currency: CurrencySchema.default('USD'),
  shippingAddress: OrderAddressSchema,
  billingAddress: OrderAddressSchema.optional(),
  metadata: MetadataSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

export const OrderStatusUpdateRequestSchema = z.object({
  status: OrderStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export const OrderCancelRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string().min(1),
  tenantId: z.string().uuid(),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email().nullable(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  totalAmount: MoneyAmountSchema,
  currency: CurrencySchema,
  shippingAddress: OrderAddressSchema,
  billingAddress: OrderAddressSchema.nullable(),
  metadata: MetadataSchema,
  correlationId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  shippedAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
});

export const OrderSummarySchema = OrderSchema.omit({
  items: true,
  shippingAddress: true,
  billingAddress: true,
  metadata: true,
});

export const OrderSearchRequestSchema = z.object({
  status: OrderStatusSchema.optional(),
  customerId: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(1).max(160).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  sortBy: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

export const OrderListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const OrderTimelineEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: OrderLedgerEventActionSchema,
  orderId: z.string().uuid(),
  orderNumber: z.string().min(1),
  correlationId: z.string().uuid(),
  status: OrderStatusSchema.optional(),
  previousStatus: OrderStatusSchema.optional(),
  reason: z.string().min(1).optional(),
  actorType: z.enum(['user', 'service', 'device', 'system']),
  actorId: z.string().min(1),
  result: z.enum(['accepted', 'rejected', 'failed']),
  timestamp: z.string().datetime(),
});

export const OrderDetailResponseSchema = OrderSchema.extend({
  timeline: z.array(OrderTimelineEventSchema),
});

export const OrderProofSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().min(1),
  correlationId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  generator: z.string().min(1),
  events: z.array(OrderTimelineEventSchema).min(1),
  proofHash: z.string().min(1),
});

export const OrderProofVerificationRequestSchema = z.object({
  proof: OrderProofSchema,
});

export const OrderProofVerificationResponseSchema = z.object({
  valid: z.boolean(),
  proofHash: z.string().min(1),
  verifiedAt: z.string().datetime(),
  reason: z.string().min(1).optional(),
});

export const OrderErrorCodeSchema = z.enum([
  'ORDER_INVALID_REQUEST',
  'ORDER_NOT_FOUND',
  'ORDER_CONFLICT',
  'ORDER_INVALID_STATUS_TRANSITION',
  'ORDER_FORBIDDEN',
]);

export const OrderErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  message: z.string().min(1),
  error: z.string().min(1).optional(),
  code: OrderErrorCodeSchema,
  details: MetadataSchema.optional(),
});

export const OrderExample = OrderSchema.parse({
  id: '33333333-3333-4333-8333-333333333333',
  orderNumber: 'ORD-20260605-0001',
  tenantId: '11111111-1111-4111-8111-111111111111',
  customerId: 'customer-100',
  customerName: 'Northwind Receiving',
  customerEmail: 'receiving@example.com',
  status: 'pending',
  items: [
    {
      sku: 'SKU-100',
      name: 'Serialized sensor kit',
      quantity: 2,
      unitPrice: 49.5,
      metadata: { lot: 'LOT-42' },
    },
  ],
  totalAmount: 99,
  currency: 'USD',
  shippingAddress: {
    line1: '100 Warehouse Way',
    city: 'Austin',
    region: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  billingAddress: null,
  metadata: { source: 'api' },
  correlationId: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
  confirmedAt: null,
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
});

export const CreateOrderRequestExample = CreateOrderRequestSchema.parse({
  customerId: 'customer-100',
  customerName: 'Northwind Receiving',
  customerEmail: 'receiving@example.com',
  items: [
    {
      sku: 'SKU-100',
      name: 'Serialized sensor kit',
      quantity: 2,
      unitPrice: 49.5,
      metadata: { lot: 'LOT-42' },
    },
  ],
  shippingAddress: {
    line1: '100 Warehouse Way',
    city: 'Austin',
    region: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  idempotencyKey: 'order-customer-100-0001',
});

export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderLedgerEventAction = z.infer<typeof OrderLedgerEventActionSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderAddress = z.infer<typeof OrderAddressSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type OrderStatusUpdateRequest = z.infer<typeof OrderStatusUpdateRequestSchema>;
export type OrderCancelRequest = z.infer<typeof OrderCancelRequestSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export type OrderSearchRequest = z.infer<typeof OrderSearchRequestSchema>;
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
export type OrderTimelineEvent = z.infer<typeof OrderTimelineEventSchema>;
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;
export type OrderProof = z.infer<typeof OrderProofSchema>;
export type OrderProofVerificationRequest = z.infer<typeof OrderProofVerificationRequestSchema>;
export type OrderProofVerificationResponse = z.infer<typeof OrderProofVerificationResponseSchema>;
export type OrderErrorCode = z.infer<typeof OrderErrorCodeSchema>;
export type OrderError = z.infer<typeof OrderErrorSchema>;
