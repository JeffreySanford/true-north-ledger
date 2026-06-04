import { Component, Input } from '@angular/core';

export type TrustSealState = 'verified' | 'pending' | 'failed';

const STATE_TEXT: Record<TrustSealState, string> = {
  verified: 'Verified by ledger state',
  pending: 'Verification pending',
  failed: 'Verification failed',
};

@Component({
  selector: 'tnl-trust-seal',
  standalone: false,
  template: `
    <span class="tnl-trust-seal" [class]="'tnl-trust-seal--' + state" [attr.aria-label]="ariaLabel">
      <span class="tnl-trust-seal__icon" aria-hidden="true">{{ icon }}</span>
      <span class="tnl-trust-seal__content">
        <span class="tnl-trust-seal__label">{{ label }}</span>
        <span class="tnl-trust-seal__state">{{ stateText }}</span>
      </span>
    </span>
  `,
})
export class TrustSealComponent {
  @Input() label = 'Trust seal';
  @Input() state: TrustSealState = 'pending';

  protected get stateText(): string {
    return STATE_TEXT[this.state];
  }

  protected get icon(): string {
    return this.state === 'verified' ? 'V' : this.state === 'failed' ? 'X' : 'P';
  }

  protected get ariaLabel(): string {
    return `${this.label}: ${this.stateText}`;
  }
}
