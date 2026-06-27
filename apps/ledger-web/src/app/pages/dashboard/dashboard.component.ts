import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subject, filter, switchMap, take, takeUntil } from 'rxjs';
import { AuthUser, AuthService } from '../../auth.service';
import { createMotionTimings, sharedAnimationTriggers } from '../../shared/animations/shared-animation-triggers';
import type { ConnectionStatusState } from '../../shared/connection-status/connection-status.component';
import {
  NotificationService,
  type LedgerNotification,
  type NotificationConnectionState,
} from '../../notification.service';
import {
  APPROVED_DEMO_OPERATIONS_SNAPSHOT,
  DashboardOperationsService,
  type DashboardOperationsSnapshot,
} from './dashboard-operations.service';

@Component({
  standalone: false,
  selector: 'tnl-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  animations: sharedAnimationTriggers,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly dashboardOperationsService = inject(DashboardOperationsService);
  private readonly destroy$ = new Subject<void>();

  protected readonly currentUser$ = this.authService.currentUser$;
  protected readonly notificationConnectionState$ =
    this.notificationService.connectionState$;
  protected readonly motionTimings = createMotionTimings();
  protected readonly recentNotifications = signal<LedgerNotification[]>([]);
  protected readonly subscriptionRooms = signal<string[]>([]);
  protected readonly operationsSnapshot = signal<DashboardOperationsSnapshot>(
    APPROVED_DEMO_OPERATIONS_SNAPSHOT,
  );

  ngOnInit(): void {
    setTimeout(() => this.notificationService.connect(), 0);
    this.notificationService
      .connectionState$.pipe(
        filter((state) => state === 'connected'),
        take(1),
        switchMap(() =>
          this.notificationService.subscribe({ eventType: 'LEDGER_EVENT' }),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        this.subscriptionRooms.set(response.rooms);
      });
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        this.recentNotifications.set([
          notification,
          ...this.recentNotifications(),
        ].slice(0, 3));
      });
    this.dashboardOperationsService
      .fetchSnapshot()
      .pipe(takeUntil(this.destroy$))
      .subscribe((snapshot) => this.operationsSnapshot.set(snapshot));
  }

  ngOnDestroy(): void {
    this.notificationService.unsubscribe({ eventType: 'LEDGER_EVENT' }).subscribe();
    this.notificationService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

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

  protected connectionStateForPrimitive(
    state: NotificationConnectionState,
  ): ConnectionStatusState {
    if (state === 'reconnecting') {
      return 'connecting';
    }

    return state;
  }

  protected readinessScore(state: NotificationConnectionState): number {
    const connectionScore = state === 'connected' ? 40 : state === 'reconnecting' ? 20 : 0;
    const subscriptionScore = this.subscriptionRooms().length > 0 ? 30 : 0;
    const eventScore = this.recentNotifications().length > 0 ? 30 : 0;

    return connectionScore + subscriptionScore + eventScore;
  }

  protected liveOperationsSource(snapshot: DashboardOperationsSnapshot): string {
    return snapshot.source === 'api'
      ? 'Live API state'
      : 'Approved fixture fallback until API state is available';
  }

  protected deviceHeartbeatLabel(snapshot: DashboardOperationsSnapshot): string {
    if (snapshot.deviceHeartbeat.total === 0) {
      return 'No devices registered';
    }

    return `${snapshot.deviceHeartbeat.online} online / ${snapshot.deviceHeartbeat.missing} missing heartbeat`;
  }

  protected liveEventCount(): number {
    return this.recentNotifications().length;
  }

  protected notificationDetail(state: NotificationConnectionState): string {
    if (state === 'connected') {
      return 'Subscribed to tenant ledger events';
    }
    if (state === 'reconnecting') {
      return 'Reconnecting to live ledger feed';
    }
    if (state === 'failed') {
      return 'Live ledger feed unavailable';
    }

    return 'Live ledger feed waiting for connection';
  }
}
