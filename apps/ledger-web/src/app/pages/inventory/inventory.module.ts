import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { VisualPrimitivesModule } from '../../shared/visual-primitives.module';
import { InventoryComponent } from './inventory.component';
import { InventoryDashboardComponent } from './inventory-dashboard.component';

@NgModule({
  declarations: [InventoryComponent, InventoryDashboardComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    VisualPrimitivesModule,
    RouterModule.forChild([{ path: '', component: InventoryComponent }]),
  ],
})
export class InventoryModule {}
