import { Component, Input } from '@angular/core';

export type LedgerEventResult = 'accepted' | 'rejected' | 'failed';

@Component({
  selector: 'tnl-ledger-event-card',
  standalone: false,
  template: `
    <article class="tnl-ledger-event-card" [class]="'tnl-ledger-event-card--' + result" [attr.aria-label]="ariaLabel">
      <div class="tnl-ledger-event-card__header">
        <span class="tnl-ledger-event-card__type">{{ eventType }}</span>
        <span class="tnl-ledger-event-card__result">{{ resultText }}</span>
      </div>
      <dl>
        <div>
          <dt>Actor</dt>
          <dd>{{ actor }}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{{ subject }}</dd>
        </div>
        <div>
          <dt>Hash</dt>
          <dd>{{ hash }}</dd>
        </div>
        <div>
          <dt>Timestamp</dt>
          <dd>{{ timestamp }}</dd>
        </div>
      </dl>
    </article>
  `,
})
export class LedgerEventCardComponent {
  @Input({ required: true }) eventType = '';
  @Input({ required: true }) actor = '';
  @Input({ required: true }) subject = '';
  @Input({ required: true }) hash = '';
  @Input({ required: true }) timestamp = '';
  @Input() result: LedgerEventResult = 'accepted';

  protected get resultText(): string {
    return this.result.charAt(0).toUpperCase() + this.result.slice(1);
  }

  protected get ariaLabel(): string {
    return `${this.eventType}: ${this.resultText}. Actor ${this.actor}. Subject ${this.subject}. Hash ${this.hash}.`;
  }
}
