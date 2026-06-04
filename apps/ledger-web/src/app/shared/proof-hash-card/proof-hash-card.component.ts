import { Component, Input } from '@angular/core';

export type ProofHashState = 'verified' | 'pending' | 'failed';

@Component({
  selector: 'tnl-proof-hash-card',
  standalone: false,
  template: `
    <article class="tnl-proof-hash-card" [class]="'tnl-proof-hash-card tnl-proof-hash-card--' + state" [attr.aria-label]="ariaLabel">
      <div class="tnl-proof-hash-card__header">
        <span class="tnl-proof-hash-card__title">{{ label }}</span>
        <span class="tnl-proof-hash-card__state">{{ stateText }}</span>
      </div>
      <dl>
        <div>
          <dt>Algorithm</dt>
          <dd>{{ algorithm }}</dd>
        </div>
        <div>
          <dt>Hash</dt>
          <dd class="tnl-proof-hash-card__hash">{{ hash }}</dd>
        </div>
      </dl>
    </article>
  `,
})
export class ProofHashCardComponent {
  @Input() label = 'Proof hash';
  @Input() algorithm = 'SHA-256';
  @Input({ required: true }) hash = '';
  @Input() state: ProofHashState = 'pending';

  protected get stateText(): string {
    if (this.state === 'verified') {
      return 'Verified';
    }

    return this.state === 'failed' ? 'Failed' : 'Pending';
  }

  protected get ariaLabel(): string {
    return `${this.label}: ${this.stateText}. ${this.algorithm} ${this.hash}.`;
  }
}
