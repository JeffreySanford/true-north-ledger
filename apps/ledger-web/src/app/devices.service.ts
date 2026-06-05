import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, switchMap, throwError, timer } from 'rxjs';
import {
  Device,
  DeviceListResponse,
  DeviceListResponseSchema,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceRegistrationResponseSchema,
  DeviceSchema,
  DeviceStatus,
  DeviceStatusUpdateRequest,
  DeviceType,
  LedgerEventResponse,
} from '@true-north-ledger/shared-models';
import { AuthService } from './auth.service';
import { LedgerEventsService } from './ledger-events.service';

@Injectable({ providedIn: 'root' })
export class DevicesService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly ledgerEventsService = inject(LedgerEventsService);

  listDevices(
    filters: { status?: DeviceStatus | ''; type?: DeviceType | ''; search?: string; page?: number; pageSize?: number } = {},
  ): Observable<DeviceListResponse> {
    let params = new HttpParams();
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.type) {
      params = params.set('type', filters.type);
    }
    if (filters.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }
    if (filters.page) {
      params = params.set('page', String(filters.page));
    }
    if (filters.pageSize) {
      params = params.set('pageSize', String(filters.pageSize));
    }

    return this.http.get<unknown>('/api/v1/devices', { headers: this.authHeaders(), params }).pipe(
      map((raw) => {
        const parsed = DeviceListResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Device list response is invalid: ${JSON.stringify(parsed.error.format())}`);
        }
        return parsed.data;
      }),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch devices'))),
    );
  }

  registerDevice(request: DeviceRegistrationRequest): Observable<DeviceRegistrationResponse> {
    return this.http.post<unknown>('/api/v1/devices/register', request, { headers: this.authHeaders() }).pipe(
      map((raw) => {
        const parsed = DeviceRegistrationResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Device registration response is invalid: ${JSON.stringify(parsed.error.format())}`);
        }
        return parsed.data;
      }),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to register device'))),
    );
  }

  getDeviceStatus(id: string): Observable<Device> {
    return this.http.get<unknown>(`/api/v1/devices/${id}/status`, { headers: this.authHeaders() }).pipe(
      map((raw) => {
        const parsed = DeviceSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Device status response is invalid: ${JSON.stringify(parsed.error.format())}`);
        }
        return parsed.data;
      }),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch device status'))),
    );
  }

  observeDeviceStatus(id: string, pollMs = 30_000): Observable<Device> {
    const intervalMs = Math.max(1_000, pollMs);
    return timer(0, intervalMs).pipe(switchMap(() => this.getDeviceStatus(id)));
  }

  getDeviceEvents(id: string): Observable<LedgerEventResponse[]> {
    return this.ledgerEventsService.fetchEvents().pipe(
      map((events) => events.filter((event) => this.isDeviceEventFor(event, id))),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch device events'))),
    );
  }

  updateDeviceStatus(id: string, request: DeviceStatusUpdateRequest): Observable<Device> {
    return this.http.patch<unknown>(`/api/v1/devices/${id}/status`, request, { headers: this.authHeaders() }).pipe(
      map((raw) => {
        const parsed = DeviceSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Device status response is invalid: ${JSON.stringify(parsed.error.format())}`);
        }
        return parsed.data;
      }),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to update device status'))),
    );
  }

  revokeDevice(id: string): Observable<Device> {
    return this.http.delete<unknown>(`/api/v1/devices/${id}`, { headers: this.authHeaders() }).pipe(
      map((raw) => {
        const parsed = DeviceSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Device revoke response is invalid: ${JSON.stringify(parsed.error.format())}`);
        }
        return parsed.data;
      }),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to revoke device'))),
    );
  }

  private authHeaders(): { Authorization?: string } {
    return this.authService.authHeaders();
  }

  private isDeviceEventFor(event: LedgerEventResponse, id: string): boolean {
    if ('deviceId' in event && event.deviceId === id) {
      return true;
    }

    if (event.subjectId === id) {
      return true;
    }

    const payload = event.payload;
    return Boolean(
      payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        'deviceId' in payload &&
        (payload as { deviceId?: unknown }).deviceId === id,
    );
  }

  private toUserFacingError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof HttpErrorResponse) {
      const apiMessage =
        error.error && typeof error.error === 'object' && 'message' in error.error
          ? String((error.error as { message?: unknown }).message)
          : undefined;
      const statusMessage = error.status ? `${error.status} ${error.statusText}`.trim() : 'network error';
      return new Error(apiMessage ?? `${fallbackMessage}: ${statusMessage}`);
    }

    return error instanceof Error ? error : new Error(fallbackMessage);
  }
}
