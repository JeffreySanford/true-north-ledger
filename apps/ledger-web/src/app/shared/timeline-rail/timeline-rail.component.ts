import { Component, Input } from '@angular/core';

export type TimelineRailEntryState = 'done' | 'current' | 'upcoming' | 'blocked';

export interface TimelineRailEntry {
  title: string;
  timestamp: string;
  state: TimelineRailEntryState;
}

@Component({
  selector: 'tnl-timeline-rail',
  standalone: false,
  template: `
    <section class="tnl-timeline-rail" [attr.aria-label]="ariaLabel">
      <h2 class="tnl-timeline-rail__title">{{ title }}</h2>
      <ol>
        @for (entry of entries; track entry.title + '-' + entry.timestamp) {
          <li [class]="'tnl-timeline-rail__entry tnl-timeline-rail__entry--' + entry.state">
            <span class="tnl-timeline-rail__marker" aria-hidden="true">{{ marker(entry.state) }}</span>
            <span class="tnl-timeline-rail__content">
              <span class="tnl-timeline-rail__entry-title">{{ entry.title }}</span>
              <span class="tnl-timeline-rail__meta">{{ entry.timestamp }} · {{ stateText(entry.state) }}</span>
            </span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class TimelineRailComponent {
  @Input() title = 'Timeline';
  @Input({ required: true }) entries: TimelineRailEntry[] = [];

  protected get ariaLabel(): string {
    return `${this.title}: ${this.entries.length} entries`;
  }

  protected stateText(state: TimelineRailEntryState): string {
    if (state === 'done') {
      return 'Done';
    }

    if (state === 'current') {
      return 'Current';
    }

    return state === 'blocked' ? 'Blocked' : 'Upcoming';
  }

  protected marker(state: TimelineRailEntryState): string {
    if (state === 'done') {
      return 'done';
    }

    if (state === 'current') {
      return 'now';
    }

    return state === 'blocked' ? 'block' : 'next';
  }
}
