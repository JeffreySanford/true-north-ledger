import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subject, filter, switchMap, take, takeUntil } from 'rxjs';
import {
  createMotionTimings,
  sharedAnimationTriggers,
} from './shared/animations/shared-animation-triggers';
import {
  type LedgerNotification,
  type NotificationConnectionState,
  NotificationService,
} from './notification.service';

interface NotificationListItem {
  id: string;
  notification: LedgerNotification;
  read: boolean;
}

interface NotificationAudioContext extends AudioContext {
  webkitAudioContext?: typeof AudioContext;
}

const notificationSoundPreferenceKey = 'tnl.notificationSoundEnabled';

@Component({
  standalone: false,
  selector: 'tnl-notification-center',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss'],
  animations: sharedAnimationTriggers,
})
export class NotificationComponent implements OnInit, OnDestroy {
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  protected readonly connectionState = signal<NotificationConnectionState>('disconnected');
  protected readonly motionTimings = createMotionTimings();
  protected readonly notifications = signal<NotificationListItem[]>([]);
  protected readonly panelOpen = signal(false);
  protected readonly soundEnabled = signal(this.restoreSoundPreference());

  ngOnInit(): void {
    this.notificationService.connectionState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        setTimeout(() => this.connectionState.set(state), 0);
      });
    setTimeout(() => this.notificationService.connect(), 0);
    this.notificationService.connectionState$
      .pipe(
        filter((state) => state === 'connected'),
        take(1),
        switchMap(() => this.notificationService.subscribe({ eventType: 'LEDGER_EVENT' })),
        takeUntil(this.destroy$),
      )
      .subscribe();
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => this.addNotification(notification));
  }

  ngOnDestroy(): void {
    this.notificationService.unsubscribe({ eventType: 'LEDGER_EVENT' }).subscribe();
    this.notificationService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected unreadCount(): number {
    return this.notifications().filter((item) => !item.read).length;
  }

  protected recentNotifications(): NotificationListItem[] {
    return this.notifications().slice(0, 8);
  }

  protected togglePanel(): void {
    this.panelOpen.update((open) => !open);
  }

  protected markAsRead(id: string): void {
    this.notifications.update((items) =>
      items.map((item) => item.id === id ? { ...item, read: true } : item),
    );
  }

  protected clearAll(): void {
    this.notifications.set([]);
    this.panelOpen.set(false);
  }

  protected connectionLabel(state: NotificationConnectionState): string {
    if (state === 'connected') return 'Connected';
    if (state === 'connecting') return 'Connecting';
    if (state === 'reconnecting') return 'Reconnecting';
    if (state === 'failed') return 'Failed';
    return 'Disconnected';
  }

  protected retryConnection(): void {
    setTimeout(() => this.notificationService.retry(), 0);
  }

  protected toggleSound(): void {
    this.soundEnabled.update((enabled) => {
      const nextEnabled = !enabled;
      this.persistSoundPreference(nextEnabled);
      return nextEnabled;
    });
  }

  protected severityIcon(notification: LedgerNotification): string {
    if (notification.priority === 'high') return 'priority_high';
    if (notification.priority === 'normal') return 'notifications';
    return 'info';
  }

  protected toastTone(notification: LedgerNotification): 'success' | 'warning' | 'error' {
    if (notification.priority === 'high') return 'error';
    if (notification.priority === 'normal') return 'warning';
    return 'success';
  }

  protected notificationTitle(notification: LedgerNotification): string {
    const action = notification.ledgerEvent.payload['action'];
    return typeof action === 'string' ? action : notification.event;
  }

  protected notificationSubject(notification: LedgerNotification): string {
    return `${notification.ledgerEvent.subjectType} / ${notification.ledgerEvent.subjectId}`;
  }

  protected trackById(_index: number, item: NotificationListItem): string {
    return item.id;
  }

  private addNotification(notification: LedgerNotification): void {
    const id = notification.ledgerEvent.id;
    this.notifications.update((items) => [
      { id, notification, read: false },
      ...items.filter((item) => item.id !== id),
    ].slice(0, 12));
    this.playNotificationSound();
    this.showBrowserNotification(notification);
  }

  private restoreSoundPreference(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(notificationSoundPreferenceKey) === 'true';
  }

  private persistSoundPreference(enabled: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(notificationSoundPreferenceKey, enabled ? 'true' : 'false');
  }

  private playNotificationSound(): void {
    if (!this.soundEnabled() || typeof window === 'undefined') {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    try {
      const context = new AudioContextConstructor() as NotificationAudioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch {
      // Browsers may block audio until a user gesture; the visual notification remains primary.
    }
  }

  private showBrowserNotification(notification: LedgerNotification): void {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      window.Notification.permission !== 'granted'
    ) {
      return;
    }

    new window.Notification(this.notificationTitle(notification), {
      body: this.notificationSubject(notification),
      tag: notification.ledgerEvent.id,
    });
  }
}
