import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('monitoring documentation', () => {
  const docs = readFileSync(workspacePath('MONITORING.md'), 'utf8');
  const prometheus = readFileSync(
    workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
    'utf8',
  );
  const alerts = readFileSync(
    workspacePath('apps', 'docker', 'prometheus', 'rules', 'ledger-alerts.yml'),
    'utf8',
  );
  const dashboard = readFileSync(
    workspacePath(
      'apps',
      'docker',
      'grafana',
      'dashboards',
      'true-north-ledger-overview.json',
    ),
    'utf8',
  );

  it('documents Grafana access and dashboard provisioning', () => {
    expect(docs).toContain('## Grafana Access');
    expect(docs).toContain('3001:3000');
    expect(docs).toContain('GRAFANA_ADMIN_USER');
    expect(docs).toContain('GRAFANA_ADMIN_PASSWORD');
    expect(docs).toContain('true-north-ledger-overview.json');
    expect(dashboard).toContain('True North Ledger Production Overview');
  });

  it('documents Prometheus scraping and alert rules from config', () => {
    expect(docs).toContain('## Prometheus Scraping');
    expect(docs).toContain('ledger-api:3000');
    expect(docs).toContain('/api/metrics');
    expect(docs).toContain('@willsoto/nestjs-prometheus');
    expect(docs).toContain('MetricsModule');
    expect(docs).toContain('15 seconds');
    expect(prometheus).toContain('scrape_interval: 15s');
    expect(alerts).toContain('TrueNorthLedgerApiDown');
    expect(alerts).toContain('TrueNorthLedgerDatabaseUnavailable');
  });

  it('documents dashboard panels and metric definitions', () => {
    for (const metric of [
      'true_north_ledger_api_up',
      'true_north_ledger_api_uptime_seconds',
      'true_north_ledger_database_up',
      'true_north_ledger_redis_configured',
      'true_north_ledger_websocket_connections_active',
      'true_north_ledger_http_requests_total',
      'true_north_ledger_http_request_duration_seconds',
      'true_north_ledger_database_query_duration_seconds',
      'true_north_ledger_ledger_events_created_total',
      'true_north_ledger_device_heartbeats_total',
    ]) {
      expect(docs).toContain(metric);
      expect(dashboard).toContain(metric);
    }

    expect(docs).toContain('## Metric Definitions');
    expect(docs).toContain('## Alert Configuration');
  });
});
