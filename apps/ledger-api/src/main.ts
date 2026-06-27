/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { openApiDtoModels } from './app/config/openapi-dto.models';
import { createOpenApiConfig, openApiPath } from './app/config/openapi.config';
import { validateRuntimeEnv } from './app/config/runtime-env.validation';

async function bootstrap() {
  validateRuntimeEnv();

  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const swaggerPath = openApiPath;
  const swaggerConfig = createOpenApiConfig();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: openApiDtoModels,
  });
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
