import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Route, RouterModule } from '@angular/router';
import { VisualPrimitivesModule } from '../../shared/visual-primitives.module';
import { OrderCreateComponent } from './order-create.component';
import { OrderDetailComponent } from './order-detail.component';
import { OrderListComponent } from './order-list.component';
import { OrderProofComponent } from './order-proof.component';
import { OrderStatusIconComponent } from './order-status-icon.component';
import { OrderTimelineComponent } from './order-timeline.component';

const routes: Route[] = [
  { path: '', component: OrderListComponent },
  { path: ':id', component: OrderDetailComponent },
];

@NgModule({
  declarations: [OrderListComponent, OrderCreateComponent, OrderDetailComponent, OrderTimelineComponent, OrderProofComponent, OrderStatusIconComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, VisualPrimitivesModule, RouterModule.forChild(routes)],
})
export class OrdersModule {}
