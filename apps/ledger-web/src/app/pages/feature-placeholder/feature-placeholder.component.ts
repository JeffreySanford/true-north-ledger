import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'tnl-feature-placeholder',
  standalone: false,
  template: `
    <section class="section-card" data-testid="feature-placeholder">
      <h1 class="page-heading">{{ title }}</h1>
      <p>
        This route is permission-gated and reserved for Sprint 1 role-specific navigation planning.
      </p>
    </section>
  `,
})
export class FeaturePlaceholderComponent {
  private readonly route = inject(ActivatedRoute);

  protected get title(): string {
    const featureTitle = this.route.snapshot.data['featureTitle'];
    return typeof featureTitle === 'string' ? featureTitle : 'Planned Feature';
  }
}
