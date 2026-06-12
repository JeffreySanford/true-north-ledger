import { Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  OrderProof,
  OrderProofVerificationResponse,
} from '@true-north-ledger/order-contracts';
import type { ProofHashState } from '../../shared/proof-hash-card/proof-hash-card.component';

@Component({
  standalone: false,
  selector: 'tnl-order-proof',
  styles: [
    `
      :host {
        grid-column: 1 / -1;
        min-width: 0;
      }
    `,
  ],
  template: `
    <article class="order-panel order-panel--wide" data-testid="order-proof-panel">
      <div class="panel-header">
        <h2>Proof</h2>
        <div>
          <button type="button" class="secondary-button" (click)="requestGeneration()" [disabled]="loading">
            {{ loading ? 'Generating Proof' : 'Generate Proof' }}
          </button>
          <button type="button" class="secondary-button" (click)="verify.emit()" [disabled]="!proof">Verify Proof</button>
          <button type="button" class="secondary-button" (click)="copyProof()" [disabled]="!proof">Copy Proof</button>
          <button type="button" class="secondary-button" (click)="downloadProof()" [disabled]="!proof">Download Proof</button>
        </div>
      </div>
      @if (proof) {
        <tnl-proof-hash-card [hash]="proof.proofHash" [state]="proofState"></tnl-proof-hash-card>
        @if (actionMessage) {
          <p class="success-message" data-testid="proof-action-message">{{ actionMessage }}</p>
        }
        @if (verification) {
          <tnl-trust-seal label="Proof verification" [state]="verification.valid ? 'verified' : 'failed'"></tnl-trust-seal>
          <p data-testid="proof-verification-result">{{ verification.valid ? 'Proof verified' : verification.reason }}</p>
        }
        <pre data-testid="proof-json">{{ proofJson }}</pre>
      } @else {
        <tnl-empty-state title="Proof not generated" message="Generate a server proof from the order ledger timeline." icon="verified"></tnl-empty-state>
      }
    </article>
  `,
  styleUrls: ['./orders.component.scss'],
})
export class OrderProofComponent {
  @Input() proof: OrderProof | null = null;
  @Input() verification: OrderProofVerificationResponse | null = null;
  @Input() loading = false;
  @Output() readonly generate = new EventEmitter<void>();
  @Output() readonly verify = new EventEmitter<void>();

  public actionMessage: string | null = null;

  public get proofState(): ProofHashState {
    if (this.verification) {
      return this.verification.valid ? 'verified' : 'failed';
    }
    return 'pending';
  }

  public get proofJson(): string {
    return this.proof ? JSON.stringify(this.proof, null, 2) : '';
  }

  public requestGeneration(): void {
    this.actionMessage = null;
    this.generate.emit();
  }

  public async copyProof(): Promise<void> {
    if (!this.proof) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      this.actionMessage = 'Clipboard is unavailable';
      return;
    }

    await navigator.clipboard.writeText(this.proofJson);
    this.actionMessage = 'Proof copied';
  }

  public downloadProof(): void {
    if (!this.proof || typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([this.proofJson], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.proof.orderNumber}-proof.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.actionMessage = 'Proof downloaded';
  }
}
