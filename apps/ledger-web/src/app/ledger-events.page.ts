import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LedgerEventsService } from './ledger-events.service';
import type { LedgerEventResponse } from '@true-north-ledger/shared-models';

@Component({
  selector: 'tnl-ledger-events',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="section-card">
      <h1 class="page-heading">Ledger Events</h1>
      <div class="page-actions">
        <button class="button-primary" (click)="refresh()">Refresh events</button>
        <button class="button-secondary" (click)="createDemo()">Create demo event</button>
      </div>

      <div *ngIf="error" class="section-card" data-testid="ledger-events-error">
        <strong>Error:</strong> {{ error }}
      </div>

      <div *ngIf="loading" class="section-card">
        Loading ledger events...
      </div>

      <ul *ngIf="!loading && events.length > 0" class="event-list" data-testid="ledger-events-list">
        <li *ngFor="let event of events" data-testid="ledger-event-row">
          <strong>{{ event.type }}</strong> — {{ event.subjectType }} / {{ event.subjectId }}<br />
          <small>Actor: {{ event.actorType }} / {{ event.actorId }}</small>
        </li>
      </ul>

      <div *ngIf="!loading && events.length === 0" class="section-card" data-testid="ledger-events-empty">
        No ledger events recorded yet. Use the button above to create a demo event.
      </div>
    </section>
  `,
})
export class LedgerEventsPage implements OnInit, OnDestroy {
  public loading = false;
  public error: string | null = null;
  public events: LedgerEventResponse[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly ledgerEventsService: LedgerEventsService) {}

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.loading = true;
    this.error = null;
    
    this.ledgerEventsService
      .fetchEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.events = events;
          this.loading = false;
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
        },
      });
  }

  createDemo(): void {
    this.loading = true;
    this.error = null;
    
    this.ledgerEventsService
      .createDemoEvent()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (created) => {
          this.events = [created, ...this.events];
          this.loading = false;
        },
        error: (error) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
        },
      });
  }
}
