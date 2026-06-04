import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    authService.setRedirectUrl(state.url ?? '/');
    router.navigate(['/login']);
    return false;
  }

  const routeData = route?.data as { requiredPermissions?: string[]; surface?: string };
  const requiredPermissions = routeData?.requiredPermissions ?? [];
  const requiredSurface = routeData?.surface;

  const supportedSurfaces = ['web', 'tablet', 'mobile', 'public'];
  if (requiredSurface && !supportedSurfaces.includes(requiredSurface)) {
    router.navigate(['/unauthorized']);
    return false;
  }

  if (requiredPermissions.length > 0 && !requiredPermissions.every((permission) => authService.hasPermission(permission))) {
    router.navigate(['/unauthorized']);
    return false;
  }

  return true;
};
