import { Route } from '@angular/router';
import { authGuard } from './auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['ledger.read'], surface: 'web' },
  },
  {
    path: 'dashboard',
    pathMatch: 'full',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['ledger.read'], surface: 'web' },
  },
  {
    path: 'ledger-events',
    loadChildren: () => import('./pages/ledger-events/ledger-events.module').then((m) => m.LedgerEventsModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['ledger.read'], surface: 'web' },
  },
  {
    path: 'devices',
    loadChildren: () => import('./pages/devices/devices.module').then((m) => m.DevicesModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['devices.read'], surface: 'web' },
  },
  {
    path: 'orders',
    loadChildren: () => import('./pages/orders/orders.module').then((m) => m.OrdersModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['orders.read'], surface: 'web' },
  },
  {
    path: 'inventory',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['inventory.read'], surface: 'web', featureTitle: 'Inventory' },
  },
  {
    path: 'shipping',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['shipping.read'], surface: 'web', featureTitle: 'Shipping' },
  },
  {
    path: 'billing',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['billing.read'], surface: 'web', featureTitle: 'Billing' },
  },
  {
    path: 'moderation',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['moderation.read'], surface: 'web', featureTitle: 'Moderation' },
  },
  {
    path: 'users',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['users.read'], surface: 'web', featureTitle: 'Users' },
  },
  {
    path: 'roles',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['roles.manage'], surface: 'web', featureTitle: 'Roles' },
  },
  {
    path: 'tablet/receiving',
    loadChildren: () =>
      import('./pages/tablet-receiving/tablet-receiving.module').then(
        (m) => m.TabletReceivingModule,
      ),
    canActivate: [authGuard],
    data: { requiredPermissions: ['devices.read'], surface: 'tablet' },
  },
  {
    path: 'tablet/counts',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['inventory.read'], surface: 'tablet', featureTitle: 'Tablet Counts' },
  },
  {
    path: 'tablet/pick-pack',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['shipping.read'], surface: 'tablet', featureTitle: 'Tablet Pick Pack' },
  },
  {
    path: 'tablet/labeling',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['shipping.read'], surface: 'tablet', featureTitle: 'Tablet Labeling' },
  },
  {
    path: 'tablet/device-pairing',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['devices.manage'], surface: 'tablet', featureTitle: 'Tablet Device Pairing' },
  },
  {
    path: 'tablet/supervisor',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['admin.override.write'], surface: 'tablet', featureTitle: 'Tablet Supervisor' },
  },
  {
    path: 'mobile/scan',
    loadChildren: () => import('./pages/mobile-scan/mobile-scan.module').then((m) => m.MobileScanModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['proof.read'], surface: 'mobile' },
  },
  {
    path: 'mobile/inventory',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['inventory.read'], surface: 'mobile', featureTitle: 'Mobile Inventory Lookup' },
  },
  {
    path: 'mobile/orders',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['orders.read'], surface: 'mobile', featureTitle: 'Mobile Order Lookup' },
  },
  {
    path: 'mobile/approve',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['admin.override.write'], surface: 'mobile', featureTitle: 'Mobile Approvals' },
  },
  {
    path: 'mobile/device',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['devices.manage'], surface: 'mobile', featureTitle: 'Mobile Device Diagnostics' },
  },
  {
    path: 'mobile/proofs',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['proof.read'], surface: 'mobile', featureTitle: 'Mobile Proof Verification' },
  },
  {
    path: 'mobile/alerts',
    loadChildren: () =>
      import('./pages/feature-placeholder/feature-placeholder.module').then((m) => m.FeaturePlaceholderModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['moderation.read'], surface: 'mobile', featureTitle: 'Mobile Alerts' },
  },
  {
    path: 'proofs',
    loadChildren: () => import('./pages/proofs/proofs.module').then((m) => m.ProofsModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['proof.read'], surface: 'web' },
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then((m) => m.SettingsModule),
    canActivate: [authGuard],
    data: { requiredPermissions: ['settings.read'], surface: 'web' },
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then((m) => m.LoginModule),
  },
  {
    path: 'unauthorized',
    loadChildren: () => import('./pages/unauthorized/unauthorized.module').then((m) => m.UnauthorizedModule),
  },
  { path: '**', redirectTo: '' },
];
