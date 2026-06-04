/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { validateAuthEnv } from './app/config/auth-env.validation';

async function bootstrap() {
  validateAuthEnv();

  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const swaggerPath = `${globalPrefix}/docs`;
  const swaggerConfig = new DocumentBuilder()
    .setTitle('True North Ledger API')
    .setDescription('Audit, provenance, authentication, and ledger event API.')
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token for authenticated ledger actors.',
      },
      'jwt',
    )
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, openApiDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`Swagger UI: http://localhost:${port}/${swaggerPath}`);
  Logger.log(`OpenAPI JSON: http://localhost:${port}/${swaggerPath}-json`);
}

bootstrap();
