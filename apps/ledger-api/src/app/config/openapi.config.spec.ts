import { createOpenApiConfig, openApiPath } from './openapi.config';

describe('OpenAPI config', () => {
  it('publishes Swagger under the API docs path', () => {
    expect(openApiPath).toBe('api/docs');
  });

  it('sets production API metadata, server URLs, and authentication schemes', () => {
    const config = createOpenApiConfig('https://ledger.example.com');

    expect(config.info).toMatchObject({
      title: 'True North Ledger API',
      version: '1.0.0',
    });
    expect(config.info.description).toContain('device ingestion');
    expect(config.servers).toEqual(
      expect.arrayContaining([
        { url: 'https://ledger.example.com', description: 'Configured API origin' },
        { url: 'http://localhost:3000', description: 'Local development' },
      ]),
    );
    expect(config.components?.securitySchemes).toMatchObject({
      jwt: expect.objectContaining({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      }),
      'device-key': expect.objectContaining({
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Key',
      }),
    });
  });

  it('falls back to local origin when no deployment origin is configured', () => {
    const config = createOpenApiConfig(undefined);

    expect(config.servers?.[0]).toEqual({
      url: 'http://localhost:3000',
      description: 'Configured API origin',
    });
  });
});
