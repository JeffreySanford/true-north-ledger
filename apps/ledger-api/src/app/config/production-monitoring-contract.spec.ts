import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MetricsService } from './metrics.service';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

interface GrafanaDashboard {
  refresh: string;
  title: string;
  uid: string;
  panels: Array<{
    title: string;
    targets?: Array<{ expr?: string }>;
  }>;
}

describe('production monitoring contract', () => {
  const prometheus = readFileSync(
    workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
    'utf8',
  );
  const grafanaDatasource = readFileSync(
    workspacePath(
      'apps',
      'docker',
      'grafana',
      'provisioning',
      'datasources',
      'prometheus.yml',
    ),
    'utf8',
  );
  const grafanaDashboardProvider = readFileSync(
    workspacePath(
      'apps',
      'docker',
      'grafana',
      'provisioning',
      'dashboards',
      'dashboards.yml',
    ),
    'utf8',
  );
  const dashboard = JSON.parse(
    readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    ),
  ) as GrafanaDashboard;

  it('scrapes the API Prometheus endpoint on the production service network', () => {
    expect(prometheus).toContain('scrape_interval: 15s');
    expect(prometheus).toContain('job_name: true-north-ledger-api');
    expect(prometheus).toContain('metrics_path: /api/metrics');
    expect(prometheus).toContain('ledger-api:3000');
    expect(prometheus).toContain('service: ledger-api');
  });

  it('provisions Grafana with the Prometheus datasource and dashboard loader', () => {
    expect(grafanaDatasource).toContain('name: Prometheus');
    expect(grafanaDatasource).toContain('type: prometheus');
    expect(grafanaDatasource).toContain('url: http://prometheus:9090');
    expect(grafanaDatasource).toContain('isDefault: true');
    expect(grafanaDashboardProvider).toContain('True North Ledger');
    expect(grafanaDashboardProvider).toContain('/var/lib/grafana/dashboards');
    expect(dashboard.title).toBe('True North Ledger Production Overview');
    expect(dashboard.uid).toBe('true-north-ledger-production');
    expect(dashboard.refresh).toBe('15s');
  });

  it('backs dashboard panels with metrics that update when runtime samples are recorded', () => {
    const metricsService = new MetricsService();

    metricsService.recordHttpRequest({
      method: 'GET',
      route: '/api/v1/ledger/events',
      statusCode: 200,
      durationSeconds: 0.12,
    });
    metricsService.recordLedgerEventCreated({
      eventType: 'LEDGER_EVENT',
      subjectType: 'order',
      result: 'accepted',
    });
    metricsService.recordDeviceHeartbeat({
      deviceType: 'scanner',
      heartbeatStatus: 'online',
      deviceStatus: 'active',
    });

    const renderedMetrics = [
      ...metricsService.renderHttpMetrics(),
      ...metricsService.renderLedgerEventMetrics(),
      ...metricsService.renderDeviceHeartbeatMetrics(),
    ].join('\n');
    const dashboardQueries = dashboard.panels
      .flatMap((panel) => panel.targets ?? [])
      .map((target) => target.expr ?? '')
      .join('\n');

    expect(renderedMetrics).toContain('true_north_ledger_http_requests_total{method="GET",route="/api/v1/ledger/events",status_code="200"} 1');
    expect(renderedMetrics).toContain('true_north_ledger_ledger_events_created_total{event_type="LEDGER_EVENT",subject_type="order",result="accepted"} 1');
    expect(renderedMetrics).toContain('true_north_ledger_device_heartbeats_total{device_type="scanner",heartbeat_status="online",device_status="active"} 1');
    expect(dashboardQueries).toContain('true_north_ledger_http_requests_total');
    expect(dashboardQueries).toContain('true_north_ledger_http_request_duration_seconds_bucket');
    expect(dashboardQueries).toContain('true_north_ledger_database_query_duration_seconds_bucket');
    expect(dashboardQueries).toContain('true_north_ledger_ledger_events_created_total');
    expect(dashboardQueries).toContain('true_north_ledger_device_heartbeats_total');
  });
});
