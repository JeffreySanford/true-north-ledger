import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'tnl-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="section-card">
      <h1 class="page-heading">Dashboard</h1>
      <p>
        Welcome to True North Ledger. This dashboard shell is the first step toward
        a contract-driven ledger platform with shared schema validation across UI,
        API, and storage.
      </p>
    </section>
  `,
})
export class DashboardPage {}
