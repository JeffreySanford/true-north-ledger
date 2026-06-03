import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { LedgerEventsComponent } from './ledger-events.component';

const routes: Route[] = [{ path: '', component: LedgerEventsComponent }];

@NgModule({
  declarations: [LedgerEventsComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class LedgerEventsModule {}
