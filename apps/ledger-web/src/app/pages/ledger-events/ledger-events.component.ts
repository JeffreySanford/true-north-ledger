import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, filter, switchMap, take } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LedgerEventsService } from '../../ledger-events.service';
import { NotificationService } from '../../notification.service';
import type { LedgerEventResponse } from '@true-north-ledger/shared-models';

@Component({
  standalone: false,
  selector: 'tnl-ledger-events',
  templateUrl: './ledger-events.component.html',
  styleUrls: ['./ledger-events.component.scss'],
})
export class LedgerEventsComponent implements OnInit, OnDestroy {
  public loading = false;
  public error: string | null = null;
  public events: LedgerEventResponse[] = [];
  public liveEventIds = new Set<string>();
  private readonly ledgerEventsService = inject(LedgerEventsService);
  private readonly notificationService = inject(NotificationService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.refresh();
    this.connectLiveEvents();
  }

  ngOnDestroy(): void {
    this.notificationService.unsubscribe({ eventType: 'LEDGER_EVENT' }).subscribe();
    this.notificationService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public refresh(): void {
    this.loading = true;
    this.error = null;

    this.ledgerEventsService
      .fetchEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.events = events;
          this.liveEventIds.clear();
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public createDemo(): void {
    this.loading = true;
    this.error = null;

    this.ledgerEventsService
      .createDemoEvent()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (created) => {
          this.events = [created, ...this.events];
          this.liveEventIds.delete(created.id);
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public trackById(_index: number, event: LedgerEventResponse): string {
    return event.id;
  }

  public isLiveEvent(event: LedgerEventResponse): boolean {
    return this.liveEventIds.has(event.id);
  }

  private connectLiveEvents(): void {
    this.notificationService.connect();
    this.notificationService.connectionState$
      .pipe(
        filter((state) => state === 'connected'),
        take(1),
        switchMap(() =>
          this.notificationService.subscribe({ eventType: 'LEDGER_EVENT' }),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        const liveEvent = notification.ledgerEvent;
        this.liveEventIds.add(liveEvent.id);
        this.events = [
          liveEvent,
          ...this.events.filter((event) => event.id !== liveEvent.id),
        ];
        this.changeDetectorRef.detectChanges();
      });
  }
}
