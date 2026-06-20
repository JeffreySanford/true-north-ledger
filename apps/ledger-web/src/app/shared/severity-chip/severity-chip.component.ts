import { Component, Input } from '@angular/core';

export type SeverityChipLevel = 'info' | 'success' | 'warning' | 'error' | 'critical';

@Component({
  selector: 'tnl-severity-chip',
  standalone: false,
  template: `
    <span
      class="tnl-severity-chip"
      data-testid="severity-chip"
      [class]="'tnl-severity-chip--' + level"
      [attr.aria-label]="ariaLabel"
    >
      <span class="tnl-severity-chip__level">{{ levelLabel }}</span>
      <span class="tnl-severity-chip__message">{{ message }}</span>
    </span>
  `,
})
export class SeverityChipComponent {
  @Input() level: SeverityChipLevel = 'info';
  @Input({ required: true }) message = '';

  protected get levelLabel(): string {
    return this.level.charAt(0).toUpperCase() + this.level.slice(1);
  }

  protected get ariaLabel(): string {
    return `${this.levelLabel}: ${this.message}`;
  }
}
