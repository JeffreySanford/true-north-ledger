import { Component, inject } from '@angular/core';
import { AuthUser, AuthService } from '../../auth.service';
import { createMotionTimings, sharedAnimationTriggers } from '../../shared/animations/shared-animation-triggers';

@Component({
  standalone: false,
  selector: 'tnl-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  animations: sharedAnimationTriggers,
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);

  protected readonly currentUser$ = this.authService.currentUser$;
  protected readonly motionTimings = createMotionTimings();

  protected roleLabel(user: AuthUser | null): string {
    if (!user) {
      return 'Guest view';
    }

    return user.permissions.includes('admin') ? 'Administrator' : 'Operator';
  }

  protected roleIconName(user: AuthUser | null): string {
    if (!user) {
      return 'person_outline';
    }

    return user.permissions.includes('admin') ? 'admin_panel_settings' : 'inventory_2';
  }

  protected roleIconGlyph(user: AuthUser | null): string {
    if (!user) {
      return 'G';
    }

    return user.permissions.includes('admin') ? 'A' : 'O';
  }

  protected missionState(user: AuthUser | null): 'pending' | 'ready' | 'complete' {
    if (!user) {
      return 'pending';
    }

    if (user.permissions.includes('roles.manage')) {
      return 'complete';
    }

    return user.permissions.includes('ledger.read') ? 'ready' : 'pending';
  }

  protected missionSourceText(user: AuthUser | null): string {
    if (!user) {
      return 'Waiting for authenticated server state';
    }

    return `Derived from authenticated server state for ${user.username}`;
  }
}
