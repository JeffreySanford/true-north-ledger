import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'tnl-devices',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="section-card">
      <h1 class="page-heading">Devices</h1>
      <p>Device operations and telemetry will appear here once the ledger device contract is active.</p>
    </section>
  `,
})
export class DevicesPage {}
