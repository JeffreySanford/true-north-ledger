import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'tnl-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="section-card">
      <h1 class="page-heading">Settings</h1>
      <p>Settings and operational controls for the ledger platform will be available here.</p>
    </section>
  `,
})
export class SettingsPage {}
