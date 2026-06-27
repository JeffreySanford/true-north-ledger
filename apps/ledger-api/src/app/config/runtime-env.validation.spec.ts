import {
  requiredRuntimeEnvNames,
  validateRuntimeEnv,
} from './runtime-env.validation';

describe('runtime environment validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('requires JWT_SECRET for every runtime mode', () => {
    delete process.env.JWT_SECRET;

    expect(() => validateRuntimeEnv('development')).toThrow(
      'Missing required environment variable: JWT_SECRET',
    );
  });

  it('requires production deployment variables when NODE_ENV is production', () => {
    process.env.JWT_SECRET = 'test-secret-000000000000000000000000000000';
    process.env.AUTH_PASSWORD = 'admin';
    process.env.AUTH_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    process.env.AUTH_USERNAME = 'admin';
    process.env.CORS_ORIGIN = 'https://ledger.example.com';
    process.env.DATABASE_URL = 'postgresql://ledger:secret@db:5432/ledger';
    process.env.JWT_EXPIRATION = '1h';
    process.env.JWT_REFRESH_EXPIRATION = '7d';
    process.env.POSTGRES_DB = 'ledger';
    process.env.POSTGRES_HOST = 'db';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_USER = 'ledger';
    delete process.env.POSTGRES_PASSWORD;

    expect(requiredRuntimeEnvNames('production')).toEqual(
      expect.arrayContaining([
        'AUTH_PASSWORD',
        'AUTH_TENANT_ID',
        'AUTH_USERNAME',
        'CORS_ORIGIN',
        'DATABASE_URL',
        'JWT_SECRET',
        'POSTGRES_PASSWORD',
      ]),
    );
    expect(() => validateRuntimeEnv('production')).toThrow(
      'Missing required environment variable: POSTGRES_PASSWORD',
    );
  });

  it('returns a non-secret summary for a valid production environment', () => {
    process.env.JWT_SECRET = 'test-secret-000000000000000000000000000000';
    process.env.AUTH_PASSWORD = 'admin';
    process.env.AUTH_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    process.env.AUTH_USERNAME = 'admin';
    process.env.CORS_ORIGIN = 'https://ledger.example.com';
    process.env.DATABASE_URL = 'postgresql://ledger:secret@db:5432/ledger';
    process.env.JWT_EXPIRATION = '1h';
    process.env.JWT_REFRESH_EXPIRATION = '7d';
    process.env.POSTGRES_DB = 'ledger';
    process.env.POSTGRES_HOST = 'db';
    process.env.POSTGRES_PASSWORD = 'secret';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_USER = 'ledger';

    expect(validateRuntimeEnv('production')).toEqual({
      nodeEnv: 'production',
      production: true,
      requiredVariables: requiredRuntimeEnvNames('production'),
    });
  });
});
