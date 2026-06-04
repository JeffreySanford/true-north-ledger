import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Route, RouterModule } from '@angular/router';
import { FeaturePlaceholderComponent } from './feature-placeholder.component';

const routes: Route[] = [{ path: '', component: FeaturePlaceholderComponent }];

@NgModule({
  declarations: [FeaturePlaceholderComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class FeaturePlaceholderModule {}
