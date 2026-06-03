import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardModule),
  },
  {
    path: 'dashboard',
    pathMatch: 'full',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardModule),
  },
  {
    path: 'ledger-events',
    loadChildren: () => import('./pages/ledger-events/ledger-events.module').then((m) => m.LedgerEventsModule),
  },
  {
    path: 'devices',
    loadChildren: () => import('./pages/devices/devices.module').then((m) => m.DevicesModule),
  },
  {
    path: 'proofs',
    loadChildren: () => import('./pages/proofs/proofs.module').then((m) => m.ProofsModule),
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then((m) => m.SettingsModule),
  },
  { path: '**', redirectTo: '' },
];
