import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './jwt.strategy';
import { requiredEnv } from '../config/required-env';

/**
 * Test helper to generate JWT tokens for integration tests
 */
export function createTestJwtToken(
  payload: Partial<JwtPayload> = {}
): string {
  const jwtService = new JwtService({
    secret: requiredEnv('JWT_SECRET'),
  });

  const defaultPayload: JwtPayload = {
    sub: 'test-user-123',
    actorType: 'user',
    tenantId: '00000000-0000-0000-0000-000000000000',
    permissions: ['read', 'write'],
    ...payload,
  };

  return jwtService.sign(defaultPayload);
}

/**
 * Test constants for common test scenarios
 */
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';
export const TEST_USER_ID = 'test-user-123';
export const TEST_DEVICE_ID = 'test-device-456';
export const TEST_SERVICE_ID = 'test-service-789';

/**
 * Pre-configured test tokens
 */
export const testTokens = {
  user: () => createTestJwtToken({
    sub: TEST_USER_ID,
    actorType: 'user',
    tenantId: TEST_TENANT_ID,
  }),
  device: () => createTestJwtToken({
    sub: TEST_DEVICE_ID,
    actorType: 'device',
    tenantId: TEST_TENANT_ID,
  }),
  service: () => createTestJwtToken({
    sub: TEST_SERVICE_ID,
    actorType: 'service',
    tenantId: TEST_TENANT_ID,
  }),
  auditor: () => createTestJwtToken({
    sub: 'test-auditor-321',
    actorType: 'user',
    tenantId: TEST_TENANT_ID,
    permissions: ['read', 'audit'],
  }),
  differentTenant: () => createTestJwtToken({
    sub: 'other-user',
    actorType: 'user',
    tenantId: '11111111-1111-4111-8111-111111111111',
  }),
};
