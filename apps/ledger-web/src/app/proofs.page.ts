import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'tnl-proofs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="section-card">
      <h1 class="page-heading">Proofs</h1>
      <p>Proof and verification workflows will be visible here once the ledger proof contract is enabled.</p>
    </section>
  `,
})
export class ProofsPage {}
