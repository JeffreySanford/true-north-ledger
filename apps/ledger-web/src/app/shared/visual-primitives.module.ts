import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ConnectionStatusComponent } from './connection-status/connection-status.component';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { LedgerEventCardComponent } from './ledger-event-card/ledger-event-card.component';
import { MissionCardComponent } from './mission-card/mission-card.component';
import { ProofHashCardComponent } from './proof-hash-card/proof-hash-card.component';
import { ProgressRailComponent } from './progress-rail/progress-rail.component';
import { SeverityChipComponent } from './severity-chip/severity-chip.component';
import { StatusChipComponent } from './status-chip/status-chip.component';
import { TimelineRailComponent } from './timeline-rail/timeline-rail.component';
import { TrustSealComponent } from './trust-seal/trust-seal.component';

@NgModule({
  imports: [CommonModule],
  declarations: [
    EmptyStateComponent,
    ConnectionStatusComponent,
    LedgerEventCardComponent,
    MissionCardComponent,
    ProofHashCardComponent,
    ProgressRailComponent,
    SeverityChipComponent,
    StatusChipComponent,
    TimelineRailComponent,
    TrustSealComponent,
  ],
  exports: [
    EmptyStateComponent,
    ConnectionStatusComponent,
    LedgerEventCardComponent,
    MissionCardComponent,
    ProofHashCardComponent,
    ProgressRailComponent,
    SeverityChipComponent,
    StatusChipComponent,
    TimelineRailComponent,
    TrustSealComponent,
  ],
})
export class VisualPrimitivesModule {}
