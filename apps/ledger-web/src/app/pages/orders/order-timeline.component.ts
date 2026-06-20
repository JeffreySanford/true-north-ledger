import { Component, Input } from '@angular/core';
import type { OrderStatus, OrderTimelineEvent } from '@true-north-ledger/order-contracts';
import { createMotionTimings, sharedAnimationTriggers } from '../../shared/animations/shared-animation-triggers';
import type { TimelineRailEntry, TimelineRailEntryState } from '../../shared/timeline-rail/timeline-rail.component';

@Component({
  standalone: false,
  selector: 'tnl-order-timeline',
  animations: sharedAnimationTriggers,
  template: `
    <div class="order-timeline-summary" data-testid="order-timeline-summary">
      <tnl-timeline-rail title="Order ledger milestones" [entries]="timelineEntries"></tnl-timeline-rail>
    </div>
    <ol class="order-timeline" data-testid="order-timeline" aria-label="Order ledger timeline">
      @for (event of events; track event.eventId; let last = $last) {
        <li
          data-testid="order-timeline-event"
          [@cardEnter]="{ value: event.eventId, params: motionTimings }"
          [class.order-timeline__event--current]="event.status === currentStatus"
          [attr.aria-label]="eventLabel(event)"
        >
          <span class="order-timeline__track" aria-hidden="true">
            <span class="order-timeline__marker">{{ marker(event) }}</span>
            @if (!last) {
              <span class="order-timeline__connector" data-testid="order-timeline-connector"></span>
            }
          </span>
          <div class="order-timeline__body">
            <tnl-ledger-event-card
              [eventType]="event.eventType"
              [actor]="event.actorType + ' / ' + event.actorId"
              [subject]="eventSubject(event)"
              [hash]="event.eventId"
              [timestamp]="event.timestamp"
              [result]="event.result"
            ></tnl-ledger-event-card>
            <button
              type="button"
              class="order-timeline__toggle"
              [attr.aria-expanded]="isExpanded(event)"
              [attr.aria-controls]="'order-timeline-details-' + event.eventId"
              (click)="toggleDetails(event)"
            >
              {{ isExpanded(event) ? 'Hide details' : 'Show details' }}
            </button>
            @if (isExpanded(event)) {
              <dl
                class="order-timeline__details"
                [@expandCollapse]="{ value: 'expanded', params: motionTimings }"
                [id]="'order-timeline-details-' + event.eventId"
                data-testid="order-timeline-details"
              >
                <div><dt>Event ID</dt><dd>{{ event.eventId }}</dd></div>
                <div><dt>Correlation ID</dt><dd>{{ event.correlationId }}</dd></div>
                <div><dt>Order ID</dt><dd>{{ event.orderId }}</dd></div>
                <div><dt>Customer ID</dt><dd>{{ event.actorMetadata.customerId }}</dd></div>
                @if (event.previousStatus) {
                  <div><dt>Previous</dt><dd>{{ event.previousStatus }}</dd></div>
                }
                @if (event.status) {
                  <div><dt>Status</dt><dd>{{ event.status }}</dd></div>
                }
                <div><dt>Result</dt><dd>{{ event.result }}</dd></div>
              </dl>
            }
          </div>
        </li>
      }
    </ol>
  `,
})
export class OrderTimelineComponent {
  @Input() events: OrderTimelineEvent[] = [];
  @Input() currentStatus: OrderStatus | null = null;
  protected readonly motionTimings = createMotionTimings();
  private readonly expandedEventIds = new Set<string>();

  protected get timelineEntries(): TimelineRailEntry[] {
    return this.events.map((event) => ({
      title: event.eventType,
      timestamp: event.timestamp,
      state: this.timelineState(event),
    }));
  }

  protected isExpanded(event: OrderTimelineEvent): boolean {
    return this.expandedEventIds.has(event.eventId);
  }

  protected toggleDetails(event: OrderTimelineEvent): void {
    if (this.expandedEventIds.has(event.eventId)) {
      this.expandedEventIds.delete(event.eventId);
      return;
    }
    this.expandedEventIds.add(event.eventId);
  }

  protected marker(event: OrderTimelineEvent): string {
    if (event.status === this.currentStatus) {
      return 'now';
    }
    return event.result === 'accepted' ? 'done' : '!';
  }

  protected eventLabel(event: OrderTimelineEvent): string {
    const statusText = event.status ? ` Status ${event.status}.` : '';
    const reasonText = event.reason ? ` Reason ${event.reason}.` : '';
    return `${event.eventType}.${statusText} Actor ${event.actorType} ${event.actorId}. Result ${event.result}.${reasonText}`;
  }

  protected eventSubject(event: OrderTimelineEvent): string {
    const statusText = event.status ? ` / ${event.status}` : '';
    const reasonText = event.reason ? ` / ${event.reason}` : '';
    return `${event.orderNumber}${statusText}${reasonText}`;
  }

  private timelineState(event: OrderTimelineEvent): TimelineRailEntryState {
    if (event.result !== 'accepted') {
      return 'blocked';
    }
    return event.status === this.currentStatus ? 'current' : 'done';
  }
}
