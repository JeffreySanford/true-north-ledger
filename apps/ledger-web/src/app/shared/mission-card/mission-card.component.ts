import { Component, Input } from '@angular/core';

export type MissionCardState = 'pending' | 'ready' | 'complete';

@Component({
  selector: 'tnl-mission-card',
  standalone: false,
  template: `
    <article class="tnl-mission-card" [class]="'tnl-mission-card--' + state" [attr.aria-label]="ariaLabel">
      <div class="tnl-mission-card__header">
        <span class="tnl-mission-card__icon" aria-hidden="true">{{ iconGlyph }}</span>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ description }}</p>
        </div>
      </div>
      <div class="tnl-mission-card__footer">
        <span class="tnl-mission-card__state">{{ stateText }}</span>
        <span class="tnl-mission-card__source">{{ sourceText }}</span>
      </div>
    </article>
  `,
})
export class MissionCardComponent {
  @Input() icon = 'task';
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() state: MissionCardState = 'pending';
  @Input() sourceText = 'Derived from server state';

  protected get stateText(): string {
    if (this.state === 'complete') {
      return 'Complete';
    }

    return this.state === 'ready' ? 'Ready' : 'Pending';
  }

  protected get ariaLabel(): string {
    return `${this.title}: ${this.stateText}. ${this.sourceText}`;
  }

  protected get iconGlyph(): string {
    const normalized = this.icon.trim().toLowerCase();

    if (normalized === 'admin_panel_settings') {
      return 'A';
    }

    if (normalized === 'inventory_2') {
      return 'O';
    }

    if (normalized === 'task' || normalized === 'task_alt') {
      return 'T';
    }

    return 'I';
  }
}
