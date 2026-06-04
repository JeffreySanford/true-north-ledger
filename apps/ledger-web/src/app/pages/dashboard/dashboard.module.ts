import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { VisualPrimitivesModule } from '../../shared/visual-primitives.module';

const routes: Route[] = [{ path: '', component: DashboardComponent }];

@NgModule({
  declarations: [DashboardComponent],
  imports: [CommonModule, RouterModule.forChild(routes), VisualPrimitivesModule],
})
export class DashboardModule {}
