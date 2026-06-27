import { requiredEnv } from './required-env';

export interface RuntimeEnvironmentStatus {
  nodeEnv: string;
  production: boolean;
  requiredVariables: string[];
}

const baselineRequiredVariables = ['JWT_SECRET'];

const productionRequiredVariables = [
  'AUTH_PASSWORD',
  'AUTH_TENANT_ID',
  'AUTH_USERNAME',
  'CORS_ORIGIN',
  'DATABASE_URL',
  'JWT_EXPIRATION',
  'JWT_REFRESH_EXPIRATION',
  'POSTGRES_DB',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT',
  'POSTGRES_USER',
];

export function requiredRuntimeEnvNames(
  nodeEnv = process.env.NODE_ENV ?? 'development',
): string[] {
  return [
    ...baselineRequiredVariables,
    ...(nodeEnv === 'production' ? productionRequiredVariables : []),
  ];
}

export function validateRuntimeEnv(
  nodeEnv = process.env.NODE_ENV ?? 'development',
): RuntimeEnvironmentStatus {
  const requiredVariables = requiredRuntimeEnvNames(nodeEnv);
  for (const variable of requiredVariables) {
    requiredEnv(variable);
  }

  return {
    nodeEnv,
    production: nodeEnv === 'production',
    requiredVariables,
  };
}
