import { DocumentBuilder } from '@nestjs/swagger';

export const openApiPath = 'api/docs';

export function createOpenApiConfig(
  publicApiOrigin = process.env.PUBLIC_API_ORIGIN ??
    process.env.CORS_ORIGIN ??
    'http://localhost:3000',
) {
  return new DocumentBuilder()
    .setTitle('True North Ledger API')
    .setDescription(
      'Audit, provenance, authentication, device ingestion, inventory, order, and real-time operations API.',
    )
    .setVersion('1.0.0')
    .addServer(publicApiOrigin, 'Configured API origin')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token for authenticated ledger actors.',
      },
      'jwt',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Key',
        description: 'Raw device API key returned once during device registration.',
      },
      'device-key',
    )
    .build();
}
