import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenApiLoginRequestDto {
  @ApiProperty({ example: 'admin' })
  username!: string;

  @ApiProperty({ example: 'admin' })
  password!: string;
}

export class OpenApiTokenRequestDto {
  @ApiProperty({ example: '<jwt>' })
  refreshToken!: string;
}

export class OpenApiAuthUserDto {
  @ApiProperty({ example: 'admin' })
  userId!: string;

  @ApiProperty({ example: 'admin' })
  username!: string;

  @ApiProperty({ example: 'user' })
  actorType!: string;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  tenantId!: string;

  @ApiPropertyOptional({ example: ['admin'], isArray: true, type: String })
  roles?: string[];

  @ApiProperty({ example: ['ledger.read', 'ledger.write'], isArray: true, type: String })
  permissions!: string[];
}

export class OpenApiAuthResponseDto {
  @ApiProperty({ example: '<jwt>' })
  accessToken!: string;

  @ApiProperty({ example: '<jwt>' })
  refreshToken!: string;

  @ApiProperty({ type: () => OpenApiAuthUserDto })
  user!: OpenApiAuthUserDto;
}

export class OpenApiLedgerEventMetadataDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  tenantId!: string;

  @ApiProperty({ example: 'request-001' })
  requestId!: string;

  @ApiPropertyOptional({ example: 'correlation-001' })
  correlationId?: string;

  @ApiProperty({ example: 'a'.repeat(64) })
  payloadHash!: string;

  @ApiPropertyOptional({ example: 'b'.repeat(64) })
  previousHash?: string;

  @ApiProperty({ example: 'c'.repeat(64) })
  eventHash!: string;

  @ApiProperty({ example: 42 })
  chainSequence!: number;

  @ApiProperty({ example: 'accepted', enum: ['accepted', 'rejected', 'failed'] })
  result!: string;

  @ApiProperty({ example: '2026-06-26T12:00:00.000Z' })
  timestamp!: string;
}

export class OpenApiLedgerEventResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'LEDGER_EVENT' })
  type!: string;

  @ApiProperty({ example: 'user' })
  actorType!: string;

  @ApiProperty({ example: 'admin' })
  actorId!: string;

  @ApiProperty({ example: 'order' })
  subjectType!: string;

  @ApiProperty({ example: 'order-001' })
  subjectId!: string;

  @ApiProperty({ example: { action: 'created' } })
  payload!: Record<string, unknown>;

  @ApiProperty({ type: () => OpenApiLedgerEventMetadataDto })
  metadata!: OpenApiLedgerEventMetadataDto;

  @ApiProperty({ example: '2026-06-26T12:00:00.000Z' })
  createdAt!: string;
}

export class OpenApiAppendLedgerEventDto {
  @ApiProperty({ example: 'LEDGER_EVENT', enum: ['LEDGER_EVENT', 'DEVICE_LEDGER_EVENT'] })
  type!: string;

  @ApiProperty({ example: 'order' })
  subjectType!: string;

  @ApiProperty({ example: 'order-001' })
  subjectId!: string;

  @ApiProperty({ example: { action: 'created' } })
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'scanner-001' })
  deviceId?: string;

  @ApiPropertyOptional({ example: 'scanner' })
  deviceType?: string;
}

export class OpenApiDeviceRegistrationRequestDto {
  @ApiProperty({ example: 'Dock scanner' })
  name!: string;

  @ApiProperty({ example: 'scanner', enum: ['scanner', 'tablet', 'sensor', 'kiosk'] })
  type!: string;

  @ApiPropertyOptional({ example: { firmware: '1.0.0' } })
  metadata?: Record<string, unknown>;
}

export class OpenApiDeviceHeartbeatRequestDto {
  @ApiPropertyOptional({ example: 'online', enum: ['online', 'offline', 'degraded'] })
  status?: string;

  @ApiPropertyOptional({ example: { battery: 92 } })
  metadata?: Record<string, unknown>;
}

export class OpenApiOrderItemDto {
  @ApiProperty({ example: 'SKU-100' })
  sku!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class OpenApiCreateOrderRequestDto {
  @ApiProperty({ example: 'customer-100' })
  customerId!: string;

  @ApiProperty({ isArray: true, type: () => OpenApiOrderItemDto })
  items!: OpenApiOrderItemDto[];

  @ApiPropertyOptional({ example: 'Priority shipment' })
  notes?: string;
}

export class OpenApiOrderStatusUpdateRequestDto {
  @ApiProperty({ example: 'confirmed' })
  status!: string;

  @ApiPropertyOptional({ example: 'Customer approved' })
  reason?: string;
}

export class OpenApiInventoryItemRequestDto {
  @ApiProperty({ example: 'SKU-100' })
  sku!: string;

  @ApiProperty({ example: 'Sensor kit' })
  name!: string;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({ example: 'AUSTIN-A1' })
  locationId!: string;

  @ApiPropertyOptional({ example: 5 })
  minimumQuantity?: number;
}

export class OpenApiInventoryScanRequestDto {
  @ApiProperty({ example: 'SKU-100' })
  value!: string;

  @ApiProperty({ example: 'barcode', enum: ['barcode', 'qr', 'rfid', 'manual'] })
  scanType!: string;

  @ApiPropertyOptional({ example: 'AUSTIN-A1' })
  locationId?: string;
}

export const openApiDtoModels = [
  OpenApiLoginRequestDto,
  OpenApiTokenRequestDto,
  OpenApiAuthUserDto,
  OpenApiAuthResponseDto,
  OpenApiLedgerEventMetadataDto,
  OpenApiLedgerEventResponseDto,
  OpenApiAppendLedgerEventDto,
  OpenApiDeviceRegistrationRequestDto,
  OpenApiDeviceHeartbeatRequestDto,
  OpenApiOrderItemDto,
  OpenApiCreateOrderRequestDto,
  OpenApiOrderStatusUpdateRequestDto,
  OpenApiInventoryItemRequestDto,
  OpenApiInventoryScanRequestDto,
];
