import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { ProofsComponent } from './proofs.component';

const routes: Route[] = [{ path: '', component: ProofsComponent }];

@NgModule({
  declarations: [ProofsComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class ProofsModule {}
