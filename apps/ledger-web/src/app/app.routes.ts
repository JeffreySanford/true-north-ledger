import { Route } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { LedgerEventsPage } from './ledger-events.page';
import { DevicesPage } from './devices.page';
import { ProofsPage } from './proofs.page';
import { SettingsPage } from './settings.page';

export const appRoutes: Route[] = [
  { path: '', component: DashboardPage },
  { path: 'ledger-events', component: LedgerEventsPage },
  { path: 'devices', component: DevicesPage },
  { path: 'proofs', component: ProofsPage },
  { path: 'settings', component: SettingsPage },
  { path: '**', redirectTo: '' },
];
