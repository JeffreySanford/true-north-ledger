import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { OrdersGateway } from './orders/orders.gateway';
import { NotificationsGateway } from './notifications/notifications.gateway';
import { MetricsService } from './config/metrics.service';

describe('AppService', () => {
  let service: AppService;
  let dataSource: {
    isInitialized: boolean;
    query: jest.Mock<Promise<unknown>, [string]>;
  };
  let ordersGateway: {
    getActiveConnectionCount: jest.Mock<number, []>;
  };
  let notificationsGateway: {
    getActiveConnectionCount: jest.Mock<number, []>;
  };
  let metricsService: {
    renderHttpMetrics: jest.Mock<string[], []>;
    renderDatabaseMetrics: jest.Mock<string[], []>;
    renderLedgerEventMetrics: jest.Mock<string[], []>;
    renderDeviceHeartbeatMetrics: jest.Mock<string[], []>;
    recordDatabaseQuery: jest.Mock<void, [{ operation: string; status: 'ok' | 'error'; durationSeconds: number }]>;
  };

  beforeEach(async () => {
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    ordersGateway = {
      getActiveConnectionCount: jest.fn().mockReturnValue(3),
    };
    notificationsGateway = {
      getActiveConnectionCount: jest.fn().mockReturnValue(2),
    };
    metricsService = {
      renderHttpMetrics: jest.fn().mockReturnValue([
        '# HELP true_north_ledger_http_requests_total Total HTTP requests by method, route, and status code.',
        '# TYPE true_north_ledger_http_requests_total counter',
        'true_north_ledger_http_requests_total{method="GET",route="/api/health",status_code="200"} 1',
        '# HELP true_north_ledger_http_request_duration_seconds HTTP request duration in seconds.',
        '# TYPE true_north_ledger_http_request_duration_seconds histogram',
        'true_north_ledger_http_request_duration_seconds_count{method="GET",route="/api/health",status_code="200"} 1',
      ]),
      renderDatabaseMetrics: jest.fn().mockReturnValue([
        '# HELP true_north_ledger_database_query_duration_seconds Database query duration in seconds.',
        '# TYPE true_north_ledger_database_query_duration_seconds histogram',
        'true_north_ledger_database_query_duration_seconds_count{operation="readiness",status="ok"} 1',
      ]),
      renderLedgerEventMetrics: jest.fn().mockReturnValue([
        '# HELP true_north_ledger_ledger_events_created_total Total ledger events created.',
        '# TYPE true_north_ledger_ledger_events_created_total counter',
        'true_north_ledger_ledger_events_created_total{event_type="LEDGER_EVENT",subject_type="order",result="accepted"} 1',
      ]),
      renderDeviceHeartbeatMetrics: jest.fn().mockReturnValue([
        '# HELP true_north_ledger_device_heartbeats_total Total device heartbeats recorded.',
        '# TYPE true_north_ledger_device_heartbeats_total counter',
        'true_north_ledger_device_heartbeats_total{device_type="scanner",heartbeat_status="online",device_status="active"} 1',
      ]),
      recordDatabaseQuery: jest.fn(),
    };

    const app = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: OrdersGateway,
          useValue: ordersGateway,
        },
        {
          provide: NotificationsGateway,
          useValue: notificationsGateway,
        },
        {
          provide: MetricsService,
          useValue: metricsService,
        },
      ],
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      expect(service.getData()).toEqual({ message: 'Hello API' });
    });
  });

  describe('getHealth', () => {
    it('returns service metadata and dependency status', async () => {
      const health = await service.getHealth();

      expect(health).toMatchObject({
        service: 'true-north-ledger-api',
        version: expect.any(String),
        status: 'ok',
        uptimeSeconds: expect.any(Number),
        timestamp: expect.any(String),
        environment: {
          nodeEnv: expect.any(String),
          production: false,
          requiredVariables: expect.arrayContaining(['JWT_SECRET']),
        },
        dependencies: {
          app: { status: 'ok' },
          database: {
            status: 'ok',
            latencyMs: expect.any(Number),
          },
          redis: {
            status: 'not_configured',
            message: expect.any(String),
          },
        },
      });
      expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(metricsService.recordDatabaseQuery).toHaveBeenCalledWith({
        operation: 'readiness',
        status: 'ok',
        durationSeconds: expect.any(Number),
      });
    });

    it('reports degraded health when the database query fails', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(service.getHealth()).resolves.toMatchObject({
        status: 'degraded',
        dependencies: {
          database: {
            status: 'error',
            message: 'database unavailable',
          },
        },
      });
      expect(metricsService.recordDatabaseQuery).toHaveBeenCalledWith({
        operation: 'readiness',
        status: 'error',
        durationSeconds: expect.any(Number),
      });
    });
  });

  describe('getReadiness', () => {
    it('returns ready when the database is initialized and queryable', async () => {
      await expect(service.getReadiness()).resolves.toMatchObject({
        service: 'true-north-ledger-api',
        ready: true,
        dependencies: {
          database: {
            status: 'ok',
          },
        },
      });
    });

    it('returns not ready when the data source is not initialized', async () => {
      dataSource.isInitialized = false;

      await expect(service.getReadiness()).resolves.toMatchObject({
        ready: false,
        dependencies: {
          database: {
            status: 'error',
            message: 'Data source is not initialized.',
          },
        },
      });
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('returns Prometheus text with baseline API and dependency metrics', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toContain('true_north_ledger_api_up 1');
      expect(metrics).toContain('true_north_ledger_database_up 1');
      expect(metrics).toContain('true_north_ledger_redis_configured 0');
      expect(metrics).toContain(
        'true_north_ledger_websocket_connections_active 5',
      );
      expect(metrics).toContain('true_north_ledger_http_requests_total');
      expect(metrics).toContain('true_north_ledger_http_request_duration_seconds');
      expect(metrics).toContain('true_north_ledger_database_query_duration_seconds');
      expect(metrics).toContain('true_north_ledger_ledger_events_created_total');
      expect(metrics).toContain('true_north_ledger_device_heartbeats_total');
      expect(ordersGateway.getActiveConnectionCount).toHaveBeenCalled();
      expect(notificationsGateway.getActiveConnectionCount).toHaveBeenCalled();
      expect(metricsService.renderHttpMetrics).toHaveBeenCalled();
      expect(metricsService.renderDatabaseMetrics).toHaveBeenCalled();
      expect(metricsService.renderLedgerEventMetrics).toHaveBeenCalled();
      expect(metricsService.renderDeviceHeartbeatMetrics).toHaveBeenCalled();
    });

    it('reports active WebSocket connections from order and notification gateways', async () => {
      ordersGateway.getActiveConnectionCount.mockReturnValueOnce(7);
      notificationsGateway.getActiveConnectionCount.mockReturnValueOnce(4);

      const metrics = await service.getMetrics();

      expect(metrics).toContain(
        '# TYPE true_north_ledger_websocket_connections_active gauge',
      );
      expect(metrics).toContain(
        'true_north_ledger_websocket_connections_active 11',
      );
      expect(ordersGateway.getActiveConnectionCount).toHaveBeenCalled();
      expect(notificationsGateway.getActiveConnectionCount).toHaveBeenCalled();
    });
  });
});
