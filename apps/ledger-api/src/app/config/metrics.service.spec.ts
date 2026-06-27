import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('renders HTTP request totals and duration histogram buckets', () => {
    service.recordHttpRequest({
      method: 'get',
      route: '/api/health',
      statusCode: 200,
      durationSeconds: 0.04,
    });
    service.recordHttpRequest({
      method: 'GET',
      route: '/api/health',
      statusCode: 200,
      durationSeconds: 0.2,
    });

    const metrics = service.renderHttpMetrics().join('\n');

    expect(metrics).toContain('# TYPE true_north_ledger_http_requests_total counter');
    expect(metrics).toContain(
      'true_north_ledger_http_requests_total{method="GET",route="/api/health",status_code="200"} 2',
    );
    expect(metrics).toContain('# TYPE true_north_ledger_http_request_duration_seconds histogram');
    expect(metrics).toContain(
      'true_north_ledger_http_request_duration_seconds_bucket{method="GET",route="/api/health",status_code="200",le="0.05"} 1',
    );
    expect(metrics).toContain(
      'true_north_ledger_http_request_duration_seconds_bucket{method="GET",route="/api/health",status_code="200",le="0.25"} 2',
    );
    expect(metrics).toContain(
      'true_north_ledger_http_request_duration_seconds_bucket{method="GET",route="/api/health",status_code="200",le="+Inf"} 2',
    );
    expect(metrics).toContain(
      'true_north_ledger_http_request_duration_seconds_count{method="GET",route="/api/health",status_code="200"} 2',
    );
  });

  it('escapes label values before rendering Prometheus text', () => {
    service.recordHttpRequest({
      method: 'GET',
      route: '/api/"quoted"',
      statusCode: 404,
      durationSeconds: 0,
    });

    expect(service.renderHttpMetrics().join('\n')).toContain(
      'route="/api/\\"quoted\\""',
    );
  });

  it('renders database query duration histogram buckets', () => {
    service.recordDatabaseQuery({
      operation: 'readiness',
      status: 'ok',
      durationSeconds: 0.004,
    });
    service.recordDatabaseQuery({
      operation: 'readiness',
      status: 'ok',
      durationSeconds: 0.04,
    });

    const metrics = service.renderDatabaseMetrics().join('\n');

    expect(metrics).toContain('# TYPE true_north_ledger_database_query_duration_seconds histogram');
    expect(metrics).toContain(
      'true_north_ledger_database_query_duration_seconds_bucket{operation="readiness",status="ok",le="0.005"} 1',
    );
    expect(metrics).toContain(
      'true_north_ledger_database_query_duration_seconds_bucket{operation="readiness",status="ok",le="0.05"} 2',
    );
    expect(metrics).toContain(
      'true_north_ledger_database_query_duration_seconds_bucket{operation="readiness",status="ok",le="+Inf"} 2',
    );
    expect(metrics).toContain(
      'true_north_ledger_database_query_duration_seconds_count{operation="readiness",status="ok"} 2',
    );
  });

  it('renders ledger event creation counters by event type, subject type, and result', () => {
    service.recordLedgerEventCreated({
      eventType: 'LEDGER_EVENT',
      subjectType: 'order',
      result: 'accepted',
    });
    service.recordLedgerEventCreated({
      eventType: 'LEDGER_EVENT',
      subjectType: 'order',
      result: 'accepted',
    });

    const metrics = service.renderLedgerEventMetrics().join('\n');

    expect(metrics).toContain('# TYPE true_north_ledger_ledger_events_created_total counter');
    expect(metrics).toContain(
      'true_north_ledger_ledger_events_created_total{event_type="LEDGER_EVENT",subject_type="order",result="accepted"} 2',
    );
  });

  it('renders device heartbeat counters by device type, heartbeat status, and device status', () => {
    service.recordDeviceHeartbeat({
      deviceType: 'scanner',
      heartbeatStatus: 'online',
      deviceStatus: 'active',
    });
    service.recordDeviceHeartbeat({
      deviceType: 'scanner',
      heartbeatStatus: 'online',
      deviceStatus: 'active',
    });

    const metrics = service.renderDeviceHeartbeatMetrics().join('\n');

    expect(metrics).toContain('# TYPE true_north_ledger_device_heartbeats_total counter');
    expect(metrics).toContain(
      'true_north_ledger_device_heartbeats_total{device_type="scanner",heartbeat_status="online",device_status="active"} 2',
    );
  });
});
