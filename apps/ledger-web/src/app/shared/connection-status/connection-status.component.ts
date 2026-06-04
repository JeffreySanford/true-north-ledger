import { Component, Input } from '@angular/core';

export type ConnectionStatusState = 'connected' | 'connecting' | 'disconnected' | 'failed';

const STATE_TEXT: Record<ConnectionStatusState, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  failed: 'Failed',
};

@Component({
  selector: 'tnl-connection-status',
  standalone: false,
  template: `
    <span class="tnl-connection-status" [class]="'tnl-connection-status--' + state" [attr.aria-label]="ariaLabel">
      <span class="tnl-connection-status__mark" aria-hidden="true"></span>
      <span class="tnl-connection-status__label">{{ label }}</span>
      <span class="tnl-connection-status__state">{{ stateText }}</span>
      <span class="tnl-connection-status__detail">{{ detail }}</span>
    </span>
  `,
})
export class ConnectionStatusComponent {
  @Input() label = 'Connection';
  @Input() state: ConnectionStatusState = 'disconnected';
  @Input() detail = 'Status unavailable';

  protected get stateText(): string {
    return STATE_TEXT[this.state];
  }

  protected get ariaLabel(): string {
    return `${this.label}: ${this.stateText}. ${this.detail}`;
  }
}
