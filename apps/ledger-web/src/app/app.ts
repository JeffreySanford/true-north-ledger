import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { createMotionTimings, sharedAnimationTriggers } from './shared/animations/shared-animation-triggers';

interface NavItem {
  label: string;
  route: string;
  exact?: boolean;
  permission: string;
}

@Component({
  selector: 'tnl-root',
  standalone: false,
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  animations: sharedAnimationTriggers,
})
export class App {
  protected title = 'ledger-web';
  protected readonly authService = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly navItems: NavItem[] = [
    { label: 'Dashboard', route: '/', exact: true, permission: 'ledger.read' },
    { label: 'Ledger Events', route: '/ledger-events', permission: 'ledger.read' },
    { label: 'Devices', route: '/devices', permission: 'devices.read' },
    { label: 'Tablet Receiving', route: '/tablet/receiving', permission: 'devices.read' },
    { label: 'Mobile Scan', route: '/mobile/scan', permission: 'proof.read' },
    { label: 'Proofs', route: '/proofs', permission: 'proof.read' },
    { label: 'Settings', route: '/settings', permission: 'settings.read' },
  ];
  protected readonly motionTimings = createMotionTimings();

  protected userInitials(username: string): string {
    const parts = username
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }

    const initials = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;

    return initials.toUpperCase();
  }

  protected logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}
