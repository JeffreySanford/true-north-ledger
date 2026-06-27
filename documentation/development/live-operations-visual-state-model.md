# Live Operations Visual State Model

The dashboard live operations board shows the current tenant feed status, operational signals, and the most recent live ledger events. It is an operational surface, so each visual state must have explicit text and accessible labels rather than relying on color alone.

## Connection State Labels

The live operations board uses the shared `tnl-connection-status` primitive for the ledger feed.

| Notification service state | Display state | Detail text |
| --- | --- | --- |
| `connected` | `Connected` | `Subscribed to tenant ledger events` |
| `reconnecting` | `Connecting` | `Reconnecting to live ledger feed` |
| `disconnected` | `Disconnected` | `Live ledger feed waiting for connection` |
| `failed` | `Failed` | `Live ledger feed unavailable` |

The shared connection primitive renders an `aria-label` in the format:

```text
Ledger feed: Connected. Subscribed to tenant ledger events
```

## Readiness Score Inputs

The readiness score is intentionally simple and reflects whether the live dashboard is receiving current tenant data.

| Input | Points | Complete when |
| --- | ---: | --- |
| Socket connected | 40 | `NotificationService.connectionState$` is `connected`. |
| Tenant subscription | 30 | The dashboard receives at least one subscription room from `NotificationService.subscribe({ eventType: 'LEDGER_EVENT' })`. |
| Recent ledger event | 30 | The dashboard has at least one notification in the current session feed. |

The board renders the total as:

```text
100 readiness points from live API, WebSocket, and ledger inputs.
```

When the socket is `reconnecting`, it receives 20 connection points instead of 40. `disconnected` and `failed` receive 0 connection points.

## Live Operations Signals

The signal row summarizes API-backed operational state:

- `Source` shows `Live API state` when `DashboardOperationsService.fetchSnapshot()` resolves from API calls.
- `Source` shows `Approved fixture fallback until API state is available` when the approved fallback snapshot is used.
- `Active sockets` is parsed from `true_north_ledger_websocket_connections_active` in `/api/metrics`.
- `Open anomalies` is loaded from the inventory anomalies API.
- `Device heartbeat` is derived from the device list as online devices compared with total registered devices.

The approved fixture fallback is a transparent demo-mode policy. It may show zero values, but it must be labeled as fixture-backed data.

## Event Highlight Rules

Live events are prepended to the dashboard feed from `NotificationService.notifications$` and the feed keeps the three most recent notifications for the session. Each item renders with the shared `tnl-ledger-event-card` primitive using:

- notification event type
- ledger actor type and actor id
- ledger subject type and subject id
- ledger event hash
- notification timestamp
- ledger event result

New feed rows use the shared `eventHighlight` animation trigger. Under `prefers-reduced-motion: reduce`, `createMotionTimings()` sets `highlightDuration` to `0ms`, so the event remains visible without motion.

## Demo Mode Data Policy

The dashboard may use `APPROVED_DEMO_OPERATIONS_SNAPSHOT` only when API-backed live operations state is unavailable. When the approved fixture is used:

- the `Source` chip must state `Approved fixture fallback until API state is available`
- active connections must remain `0 active connections`
- open anomalies must remain `0 open anomalies`
- device heartbeat must state `No devices registered`

Do not introduce hardcoded success states for the live operations board. Use API state when available, and label approved fixture fallback data clearly.
