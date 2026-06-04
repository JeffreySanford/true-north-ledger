import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, tap, throwError } from 'rxjs';

export interface AuthUser {
  userId: string;
  username: string;
  actorType: 'user' | 'service' | 'device' | 'system';
  tenantId: string;
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly accessTokenKey = 'tnl.authToken';
  private readonly refreshTokenKey = 'tnl.refreshToken';
  private readonly userKey = 'tnl.authUser';
  private readonly redirectUrlKey = 'tnl.redirectUrl';
  private readonly rememberSessionKey = 'tnl.rememberSession';
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly authState = new BehaviorSubject<AuthUser | null>(this.restoreUser());

  readonly authState$ = this.authState.asObservable();
  readonly currentUser$ = this.authState.asObservable();
  readonly isAuthenticated$ = this.authState.pipe(map(Boolean));

  constructor() {
    this.scheduleRefresh();
  }

  setRememberSession(enabled: boolean): void {
    localStorage.setItem(this.rememberSessionKey, enabled ? 'true' : 'false');
  }

  login(credentials: { username: string; password: string }): Observable<AuthUser> {
    return this.http.post<AuthResponse>('/api/v1/auth/login', credentials).pipe(
      tap((response) => this.saveSession(response)),
      map((response) => response.user),
      catchError((error) => throwError(() => this.toError(error, 'Login failed'))),
    );
  }

  logout(): Observable<void> {
    const refreshToken = this.refreshToken;
    this.clearSession();

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available')); 
    }

    return this.http.post<void>('/api/v1/auth/logout', { refreshToken }).pipe(
      catchError((error) => throwError(() => this.toError(error, 'Logout failed'))),
    );
  }

  refresh(): Observable<AuthUser> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('Refresh token not found')); 
    }

    return this.http.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken }).pipe(
      tap((response) => this.saveSession(response)),
      map((response) => response.user),
      catchError((error) => throwError(() => this.toError(error, 'Session refresh failed'))),
    );
  }

  get accessToken(): string | null {
    return this.getStoredValue(this.accessTokenKey);
  }

  get refreshToken(): string | null {
    return this.getStoredValue(this.refreshTokenKey);
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getCurrentUser(): AuthUser | null {
    return this.authState.value;
  }

  hasPermission(permission: string): boolean {
    return this.authState.value?.permissions?.includes(permission) ?? false;
  }

  clearSession(): void {
    this.clearStoredSession();
  }

  setRedirectUrl(url: string): void {
    localStorage.setItem(this.redirectUrlKey, url);
  }

  getRedirectUrl(): string | null {
    return localStorage.getItem(this.redirectUrlKey);
  }

  clearRedirectUrl(): void {
    localStorage.removeItem(this.redirectUrlKey);
  }

  authHeaders(): { Authorization?: string } {
    const token = this.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private restoreUser(): AuthUser | null {
    try {
      const raw = this.getStoredValue(this.userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveSession(response: AuthResponse): void {
    const storage = this.getSessionStorage();
    storage.setItem(this.accessTokenKey, response.accessToken);
    storage.setItem(this.refreshTokenKey, response.refreshToken);
    storage.setItem(this.userKey, JSON.stringify(response.user));

    const secondaryStorage = storage === localStorage ? sessionStorage : localStorage;
    secondaryStorage.removeItem(this.accessTokenKey);
    secondaryStorage.removeItem(this.refreshTokenKey);
    secondaryStorage.removeItem(this.userKey);

    this.authState.next(response.user);
    this.scheduleRefresh();
  }

  private clearStoredSession(): void {
    this.clearRefreshTimer();
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    sessionStorage.removeItem(this.accessTokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.userKey);
    this.authState.next(null);
  }

  private getSessionStorage(): Storage {
    const rememberSession = localStorage.getItem(this.rememberSessionKey);
    // Default to sessionStorage to reduce persistence unless the user explicitly opts in.
    return rememberSession === 'true' ? localStorage : sessionStorage;
  }

  private getStoredValue(key: string): string | null {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof HttpErrorResponse) {
      const apiMessage =
        error.error && typeof error.error === 'object' && 'message' in error.error
          ? String((error.error as { message?: unknown }).message)
          : undefined;
      return new Error(apiMessage ?? `${fallbackMessage}: ${error.status} ${error.statusText}`);
    }

    return error instanceof Error ? error : new Error(fallbackMessage);
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    const token = this.accessToken;
    if (!token) {
      return;
    }

    const payload = this.decodeJwtPayload(token);
    const expMs = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
    if (!expMs) {
      return;
    }

    const refreshLeadMs = 30_000;
    const delay = Math.max(0, expMs - Date.now() - refreshLeadMs);
    this.refreshTimer = setTimeout(() => {
      this.refresh().subscribe({
        error: () => this.clearSession(),
      });
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (!this.refreshTimer) {
      return;
    }
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private decodeJwtPayload(token: string): { exp?: number } | null {
    const segments = token.split('.');
    if (segments.length < 2) {
      return null;
    }

    try {
      const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const normalized = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const decoded = atob(normalized);
      return JSON.parse(decoded) as { exp?: number };
    } catch {
      return null;
    }
  }
}
