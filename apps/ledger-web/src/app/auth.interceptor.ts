import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const excludedAuthPaths = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout'];

function shouldAttachAuthHeader(url: string): boolean {
  return !excludedAuthPaths.some((path) => url.includes(path));
}

function isAuthEndpoint(url: string): boolean {
  return excludedAuthPaths.some((path) => url.includes(path));
}

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.accessToken;
  const request = shouldAttachAuthHeader(req.url) && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 && !isAuthEndpoint(req.url)) {
          return authService.refresh().pipe(
            switchMap(() => {
              const refreshedToken = authService.accessToken;
              const retryRequest = shouldAttachAuthHeader(req.url) && refreshedToken
                ? req.clone({ setHeaders: { Authorization: `Bearer ${refreshedToken}` } })
                : req;
              return next(retryRequest);
            }),
            catchError((refreshError) => {
              authService.clearSession();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            }),
          );
        }

        if (error.status === 401) {
          authService.clearSession();
          router.navigate(['/login']);
        } else if (error.status === 403) {
          router.navigate(['/unauthorized']);
        }
      }
      return throwError(() => error);
    }),
  );
};
