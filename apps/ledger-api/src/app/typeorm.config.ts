import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import { LedgerEventEntity } from './ledger-events/ledger-event.entity';

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
  password: process.env.POSTGRES_PASSWORD || 'local_postgres_password_required',
  database: process.env.POSTGRES_DB || 'ledger_dev',
  entities: [LedgerEventEntity],
  migrations: [],
  synchronize: process.env.NODE_ENV !== 'production', // Auto-create schema in dev
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.ENABLE_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const dataSource = new DataSource(typeOrmConfig);

export default dataSource;
