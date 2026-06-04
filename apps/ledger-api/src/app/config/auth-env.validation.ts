import { requiredEnv } from './required-env';

export function validateAuthEnv(): void {
  requiredEnv('JWT_SECRET');
}
