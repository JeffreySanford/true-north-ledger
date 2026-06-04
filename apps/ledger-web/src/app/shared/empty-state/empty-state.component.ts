import { Component, Input } from '@angular/core';

@Component({
  selector: 'tnl-empty-state',
  standalone: false,
  template: `
    <section class="tnl-empty-state" [attr.aria-label]="title" data-testid="empty-state">
      <span class="tnl-empty-state__icon" aria-hidden="true">{{ iconGlyph }}</span>
      <div>
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
      </div>
    </section>
  `,
})
export class EmptyStateComponent {
  @Input() icon = 'info';
  @Input({ required: true }) title = '';
  @Input({ required: true }) message = '';

  protected get iconGlyph(): string {
    const normalized = this.icon.trim().toLowerCase();

    if (normalized === 'task_alt' || normalized === 'task') {
      return 'T';
    }

    return 'I';
  }
}
