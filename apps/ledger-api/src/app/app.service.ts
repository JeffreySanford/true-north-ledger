import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrdersGateway } from './orders/orders.gateway';
import { NotificationsGateway } from './notifications/notifications.gateway';
import {
  type RuntimeEnvironmentStatus,
  validateRuntimeEnv,
} from './config/runtime-env.validation';
import { MetricsService } from './config/metrics.service';

export interface DependencyStatus {
  status: 'ok' | 'error' | 'not_configured';
  latencyMs?: number;
  message?: string;
}

export interface HealthResponse {
  service: string;
  version: string;
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    app: DependencyStatus;
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  environment: RuntimeEnvironmentStatus;
}

export interface ReadinessResponse {
  service: string;
  ready: boolean;
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
  };
}

@Injectable()
export class AppService {
  private readonly serviceName = 'true-north-ledger-api';
  private readonly serviceVersion = process.env.npm_package_version ?? '0.1.0';

  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersGateway: OrdersGateway,
    private readonly metricsService: MetricsService,
    @Optional()
    private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  getData(): { message: string } {
    return { message: 'Hello API' };
  }

  async getHealth(): Promise<HealthResponse> {
    const database = await this.getDatabaseStatus();
    const redis = this.getRedisStatus();
    const status = database.status === 'ok' ? 'ok' : 'degraded';

    return {
      service: this.serviceName,
      version: this.serviceVersion,
      status,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: validateRuntimeEnv(),
      dependencies: {
        app: { status: 'ok' },
        database,
        redis,
      },
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const database = await this.getDatabaseStatus();

    return {
      service: this.serviceName,
      ready: database.status === 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
      },
    };
  }

  async getMetrics(): Promise<string> {
    const database = await this.getDatabaseStatus();
    const redis = this.getRedisStatus();
    const databaseUp = database.status === 'ok' ? 1 : 0;
    const redisConfigured = redis.status === 'not_configured' ? 0 : 1;

    return [
      '# HELP true_north_ledger_api_up Whether the API process is running.',
      '# TYPE true_north_ledger_api_up gauge',
      'true_north_ledger_api_up 1',
      '# HELP true_north_ledger_api_uptime_seconds API process uptime in seconds.',
      '# TYPE true_north_ledger_api_uptime_seconds gauge',
      `true_north_ledger_api_uptime_seconds ${Math.round(process.uptime())}`,
      '# HELP true_north_ledger_database_up Whether the configured database responds to a readiness query.',
      '# TYPE true_north_ledger_database_up gauge',
      `true_north_ledger_database_up ${databaseUp}`,
      '# HELP true_north_ledger_redis_configured Whether Redis is configured for runtime services.',
      '# TYPE true_north_ledger_redis_configured gauge',
      `true_north_ledger_redis_configured ${redisConfigured}`,
      '# HELP true_north_ledger_websocket_connections_active Active WebSocket connections.',
      '# TYPE true_north_ledger_websocket_connections_active gauge',
      `true_north_ledger_websocket_connections_active ${this.getActiveWebSocketConnectionCount()}`,
      ...this.metricsService.renderHttpMetrics(),
      ...this.metricsService.renderDatabaseMetrics(),
      ...this.metricsService.renderLedgerEventMetrics(),
      ...this.metricsService.renderDeviceHeartbeatMetrics(),
      '',
    ].join('\n');
  }

  private getActiveWebSocketConnectionCount(): number {
    return (
      this.ordersGateway.getActiveConnectionCount() +
      (this.notificationsGateway?.getActiveConnectionCount() ?? 0)
    );
  }

  private async getDatabaseStatus(): Promise<DependencyStatus> {
    if (!this.dataSource.isInitialized) {
      return {
        status: 'error',
        message: 'Data source is not initialized.',
      };
    }

    const startedAt = performance.now();

    try {
      await this.dataSource.query('SELECT 1');
      const latencyMs = Math.round(performance.now() - startedAt);
      this.metricsService.recordDatabaseQuery({
        operation: 'readiness',
        status: 'ok',
        durationSeconds: latencyMs / 1000,
      });

      return {
        status: 'ok',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      this.metricsService.recordDatabaseQuery({
        operation: 'readiness',
        status: 'error',
        durationSeconds: latencyMs / 1000,
      });

      return {
        status: 'error',
        latencyMs,
        message:
          error instanceof Error
            ? error.message
            : 'Database readiness query failed.',
      };
    }
  }

  private getRedisStatus(): DependencyStatus {
    return process.env.REDIS_URL
      ? { status: 'ok' }
      : {
          status: 'not_configured',
          message: 'REDIS_URL is not configured for this runtime.',
        };
  }
}
