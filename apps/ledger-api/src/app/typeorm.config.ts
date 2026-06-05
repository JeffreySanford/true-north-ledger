import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import { LedgerEventEntity } from './ledger-events/ledger-event.entity';
import { HardenLedgerChain1717420000000 } from './migrations/1717420000000-harden-ledger-chain';
import { AuthServiceTokenAndRoleMappings1717430000000 } from './migrations/1717430000000-auth-service-token-and-role-mappings';
import { TenantUserRoles1717440000000 } from './migrations/1717440000000-tenant-user-roles';
import { DeviceManagement1717450000000 } from './migrations/1717450000000-device-management';
import { ServiceTokenEntity } from './auth/service-token.entity';
import { TenantRolePermissionEntity } from './auth/tenant-role-permission.entity';
import { UserRoleRecordEntity } from './auth/user-role-record.entity';
import { DeviceEntity } from './devices/device.entity';
import { DeviceNonceEntity } from './devices/device-nonce.entity';
import { requiredEnv } from './config/required-env';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

config({ path: join(__dirname, '..', '..', '..', '..', envFile) });

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'ledger_user',
  password: requiredEnv('POSTGRES_PASSWORD'),
  database: process.env.POSTGRES_DB || 'ledger_dev',
  entities: [
    LedgerEventEntity,
    ServiceTokenEntity,
    TenantRolePermissionEntity,
    UserRoleRecordEntity,
    DeviceEntity,
    DeviceNonceEntity,
  ],
  migrations: [
    HardenLedgerChain1717420000000,
    AuthServiceTokenAndRoleMappings1717430000000,
    TenantUserRoles1717440000000,
    DeviceManagement1717450000000,
  ],
  synchronize: process.env.NODE_ENV !== 'production', // Auto-create schema in dev
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.ENABLE_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const dataSource = new DataSource(typeOrmConfig);

export default dataSource;
