import { Component, Input } from '@angular/core';

export type ProgressRailStepState = 'complete' | 'current' | 'pending';

export interface ProgressRailStep {
  label: string;
  state: ProgressRailStepState;
}

@Component({
  selector: 'tnl-progress-rail',
  standalone: false,
  template: `
    <section class="tnl-progress-rail" data-testid="progress-rail" [attr.aria-label]="ariaLabel">
      <div class="tnl-progress-rail__summary">
        <span class="tnl-progress-rail__title">{{ title }}</span>
        <span class="tnl-progress-rail__count">{{ completedCount }} of {{ steps.length }} complete</span>
      </div>
      <ol>
        @for (step of steps; track step.label + '-' + step.state) {
          <li
            data-testid="progress-rail-step"
            [class]="'tnl-progress-rail__step tnl-progress-rail__step--' + step.state"
            [attr.aria-label]="stepAriaLabel(step)"
          >
            <span class="tnl-progress-rail__marker" aria-hidden="true">{{ markerFor(step.state) }}</span>
            <span class="tnl-progress-rail__text">
              <span class="tnl-progress-rail__label">{{ step.label }}</span>
              <span class="tnl-progress-rail__state">{{ stateText(step.state) }}</span>
            </span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class ProgressRailComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) steps: ProgressRailStep[] = [];

  protected get completedCount(): number {
    return this.steps.filter((step) => step.state === 'complete').length;
  }

  protected get ariaLabel(): string {
    return `${this.title}: ${this.completedCount} of ${this.steps.length} complete`;
  }

  protected markerFor(state: ProgressRailStepState): string {
    if (state === 'complete') {
      return 'done';
    }

    return state === 'current' ? 'now' : 'todo';
  }

  protected stateText(state: ProgressRailStepState): string {
    if (state === 'complete') {
      return 'Complete';
    }

    return state === 'current' ? 'Current' : 'Pending';
  }

  protected stepAriaLabel(step: ProgressRailStep): string {
    return `${step.label}: ${this.stateText(step.state)}`;
  }
}
