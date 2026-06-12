import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
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
export class App implements OnInit, OnDestroy {
  protected title = 'ledger-web';
  protected readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  protected readonly router = inject(Router);
  protected readonly navItems: NavItem[] = [
    { label: 'Dashboard', route: '/', exact: true, permission: 'ledger.read' },
    { label: 'Ledger Events', route: '/ledger-events', permission: 'ledger.read' },
    { label: 'Devices', route: '/devices', permission: 'devices.read' },
    { label: 'Orders', route: '/orders', permission: 'orders.read' },
    { label: 'Tablet Receiving', route: '/tablet/receiving', permission: 'devices.read' },
    { label: 'Mobile Scan', route: '/mobile/scan', permission: 'proof.read' },
    { label: 'Proofs', route: '/proofs', permission: 'proof.read' },
    { label: 'Settings', route: '/settings', permission: 'settings.read' },
  ];
  protected readonly motionTimings = createMotionTimings();
  protected orderCount: number | null = null;
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      this.orderCount = null;
      if (user && this.authService.hasPermission('orders.read')) {
        this.loadOrderCount();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

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

  private loadOrderCount(): void {
    const params = new HttpParams().set('page', '1').set('pageSize', '1');
    this.http
      .get<{ total?: number }>('/api/v1/orders', { headers: this.authService.authHeaders(), params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.orderCount = typeof response.total === 'number' ? response.total : null;
        },
        error: () => {
          this.orderCount = null;
        },
      });
  }
}
