import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';
import { authInterceptor } from './auth.interceptor';
import { NotificationComponent } from './notification.component';
import { VisualPrimitivesModule } from './shared/visual-primitives.module';

@NgModule({
  declarations: [App, NotificationComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    RouterModule.forRoot(appRoutes),
    VisualPrimitivesModule,
  ],
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
  bootstrap: [App],
})
export class AppModule {}
