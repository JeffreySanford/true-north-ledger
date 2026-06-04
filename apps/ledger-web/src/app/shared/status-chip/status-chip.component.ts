import { Component, Input } from '@angular/core';

export type StatusChipTone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

@Component({
  selector: 'tnl-status-chip',
  standalone: false,
  template: `
    <span class="tnl-status-chip" [class]="'tnl-status-chip--' + tone" [attr.aria-label]="ariaLabel">
      <span class="tnl-status-chip__mark" aria-hidden="true"></span>
      <span class="tnl-status-chip__label">{{ label }}</span>
      <span class="tnl-status-chip__state">{{ stateText }}</span>
    </span>
  `,
})
export class StatusChipComponent {
  @Input({ required: true }) label = '';
  @Input() stateText = 'Status';
  @Input() tone: StatusChipTone = 'neutral';

  protected get ariaLabel(): string {
    return `${this.label}: ${this.stateText}`;
  }
}
