import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LedgerEventsService } from '../../ledger-events.service';
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
  private readonly ledgerEventsService = inject(LedgerEventsService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
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
}
