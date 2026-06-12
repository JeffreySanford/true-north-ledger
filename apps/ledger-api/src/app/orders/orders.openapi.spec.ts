import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TokenAuthGuard } from '../auth/token-auth.guard';
import { OrdersController, ProofsController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('Orders OpenAPI documentation', () => {
  let app: INestApplication | undefined;
  let document: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      controllers: [OrdersController, ProofsController],
      providers: [
        { provide: OrdersService, useValue: {} },
      ],
    });
    const guard = { canActivate: () => true };
    const moduleRef = await builder
      .overrideGuard(TokenAuthGuard)
      .useValue(guard)
      .overrideGuard(TenantGuard)
      .useValue(guard)
      .overrideGuard(PermissionsGuard)
      .useValue(guard)
      .overrideGuard(RateLimitGuard)
      .useValue(guard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Orders OpenAPI test').addBearerAuth({}, 'jwt').build(),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documents typical creation and status transition examples', () => {
    const create = document.paths['/api/v1/orders']?.post;
    const status = document.paths['/api/v1/orders/{id}/status']?.patch;

    expect(create?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { example: expect.objectContaining({ customerId: 'customer-100' }) } } },
    });
    expect(create?.responses['201']).toMatchObject({
      content: { 'application/json': { schema: { example: expect.objectContaining({ status: 'pending' }) } } },
    });
    expect(status?.description).toContain('pending -> confirmed -> processing -> shipped -> delivered');
    expect(status?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { example: { status: 'confirmed', reason: expect.any(String) } } } },
    });
  });

  it('documents validation, authorization, not-found, conflict, and rate-limit responses', () => {
    expect(document.paths['/api/v1/orders']?.post?.responses).toEqual(
      expect.objectContaining({ '400': expect.any(Object), '403': expect.any(Object), '429': expect.any(Object) }),
    );
    expect(document.paths['/api/v1/orders/{id}/status']?.patch?.responses).toEqual(
      expect.objectContaining({ '400': expect.any(Object), '403': expect.any(Object), '404': expect.any(Object), '409': expect.any(Object) }),
    );
    expect(document.paths['/api/v1/proofs/verify']?.post?.responses).toEqual(
      expect.objectContaining({ '400': expect.any(Object), '403': expect.any(Object) }),
    );
  });
});
