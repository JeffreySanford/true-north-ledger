import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('live operations visual state documentation', () => {
  const docs = readFileSync(
    workspacePath('documentation', 'development', 'live-operations-visual-state-model.md'),
    'utf8',
  );
  const docsIndex = readFileSync(workspacePath('documentation', 'README.md'), 'utf8');
  const dashboard = readFileSync(
    workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard.component.ts'),
    'utf8',
  );
  const dashboardTemplate = readFileSync(
    workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard.component.html'),
    'utf8',
  );
  const operationsService = readFileSync(
    workspacePath('apps', 'ledger-web', 'src', 'app', 'pages', 'dashboard', 'dashboard-operations.service.ts'),
    'utf8',
  );
  const connectionStatus = readFileSync(
    workspacePath('apps', 'ledger-web', 'src', 'app', 'shared', 'connection-status', 'connection-status.component.ts'),
    'utf8',
  );
  const animations = readFileSync(
    workspacePath('apps', 'ledger-web', 'src', 'app', 'shared', 'animations', 'shared-animation-triggers.ts'),
    'utf8',
  );

  it('is linked from the documentation index', () => {
    expect(docsIndex).toContain('[Live Operations Visual State Model](development/live-operations-visual-state-model.md)');
  });

  it('documents connection labels from the dashboard and shared primitive', () => {
    for (const expected of [
      'Subscribed to tenant ledger events',
      'Reconnecting to live ledger feed',
      'Live ledger feed waiting for connection',
      'Live ledger feed unavailable',
    ]) {
      expect(docs).toContain(expected);
      expect(dashboard).toContain(expected);
    }

    expect(docs).toContain('`reconnecting` | `Connecting`');
    expect(dashboard).toContain("return 'connecting';");
    expect(connectionStatus).toContain("connected: 'Connected'");
    expect(connectionStatus).toContain("failed: 'Failed'");
    expect(connectionStatus).toContain('`${this.label}: ${this.stateText}. ${this.detail}`');
  });

  it('documents readiness score inputs from the dashboard implementation', () => {
    expect(docs).toContain('| Socket connected | 40 |');
    expect(docs).toContain('| Tenant subscription | 30 |');
    expect(docs).toContain('| Recent ledger event | 30 |');
    expect(docs).toContain('reconnecting');
    expect(docs).toContain('20 connection points');
    expect(dashboard).toContain("state === 'connected' ? 40 : state === 'reconnecting' ? 20 : 0");
    expect(dashboard).toContain('subscriptionRooms().length > 0 ? 30 : 0');
    expect(dashboard).toContain('recentNotifications().length > 0 ? 30 : 0');
    expect(dashboardTemplate).toContain('readiness points from live API, WebSocket, and ledger inputs');
  });

  it('documents live signals and approved fixture fallback policy', () => {
    for (const expected of [
      'Live API state',
      'Approved fixture fallback until API state is available',
      'true_north_ledger_websocket_connections_active',
      'No devices registered',
      '0 active connections',
      '0 open anomalies',
    ]) {
      expect(docs).toContain(expected);
    }

    expect(operationsService).toContain('APPROVED_DEMO_OPERATIONS_SNAPSHOT');
    expect(operationsService).toContain("source: 'approved-fixture'");
    expect(operationsService).toContain('true_north_ledger_websocket_connections_active');
    expect(dashboard).toContain('Approved fixture fallback until API state is available');
  });

  it('documents event highlight and reduced-motion behavior', () => {
    expect(docs).toContain('the feed keeps the three most recent notifications');
    expect(docs).toContain('eventHighlight');
    expect(docs).toContain('prefers-reduced-motion: reduce');
    expect(docs).toContain('highlightDuration` to `0ms`');
    expect(dashboard).toContain('].slice(0, 3)');
    expect(dashboardTemplate).toContain('[@eventHighlight]');
    expect(dashboardTemplate).toContain('tnl-ledger-event-card');
    expect(animations).toContain('highlightDuration: \'0ms\'');
    expect(animations).toContain("trigger('eventHighlight'");
  });
});
