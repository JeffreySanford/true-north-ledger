import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import {
  CreateInventoryItemRequest,
  InventoryAlertListResponse,
  InventoryAlertListResponseSchema,
  InventoryAlertSeverity,
  InventoryAlertType,
  InventoryAnomalyListResponse,
  InventoryAnomalyListRequest,
  InventoryAnomalyListResponseSchema,
  InventoryBulkMoveRequest,
  InventoryBulkMoveResponse,
  InventoryBulkMoveResponseSchema,
  InventoryExpiredReservationReleaseResponse,
  InventoryExpiredReservationReleaseResponseSchema,
  InventoryImportRequest,
  InventoryImportResponse,
  InventoryImportResponseSchema,
  InventoryBatchScanRequest,
  InventoryBatchScanResponse,
  InventoryBatchScanResponseSchema,
  InventoryItem,
  InventoryItemSchema,
  InventoryListRequest,
  InventoryListResponse,
  InventoryListResponseSchema,
  InventoryMoveRequest,
  InventoryQuantityAdjustmentRequest,
  InventoryProvenanceResponse,
  InventoryProvenanceResponseSchema,
  InventoryReservationReleaseRequest,
  InventoryReservationRequest,
  InventoryRemovalRequest,
  InventoryScanRequest,
  InventoryStatusChangeRequest,
} from '@true-north-ledger/inventory-contracts';
import { AuthService } from './auth.service';

export type InventoryListFilters = Partial<InventoryListRequest>;

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  listInventory(filters: InventoryListFilters = {}): Observable<InventoryListResponse> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http
      .get<unknown>('/api/v1/inventory', { headers: this.authService.authHeaders(), params })
      .pipe(
        map((raw) => InventoryListResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory'))),
      );
  }

  addInventory(request: CreateInventoryItemRequest): Observable<InventoryItem> {
    return this.http
      .post<unknown>('/api/v1/inventory', request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to add inventory'))),
      );
  }

  importInventory(request: InventoryImportRequest): Observable<InventoryImportResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/import', request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryImportResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to import inventory'))),
      );
  }

  getInventoryItem(id: string): Observable<InventoryItem> {
    return this.http
      .get<unknown>(`/api/v1/inventory/${id}`, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory item'))),
      );
  }

  getInventoryItemWithProvenance(id: string): Observable<InventoryProvenanceResponse> {
    return this.http
      .get<unknown>(`/api/v1/inventory/${id}`, {
        headers: this.authService.authHeaders(),
        params: new HttpParams().set('includeProvenance', 'true'),
      })
      .pipe(
        map((raw) => InventoryProvenanceResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory item provenance'))),
      );
  }

  getInventoryItemBySku(sku: string): Observable<InventoryItem> {
    return this.http
      .get<unknown>(`/api/v1/inventory/sku/${encodeURIComponent(sku.trim())}`, {
        headers: this.authService.authHeaders(),
      })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory item'))),
      );
  }

  reserveInventory(id: string, request: InventoryReservationRequest): Observable<InventoryItem> {
    return this.http
      .patch<unknown>(`/api/v1/inventory/${id}/reserve`, request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to reserve inventory'))),
      );
  }

  releaseInventory(id: string, request: InventoryReservationReleaseRequest = {}): Observable<InventoryItem> {
    return this.http
      .patch<unknown>(`/api/v1/inventory/${id}/release`, request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to release inventory reservation'))),
      );
  }

  releaseExpiredReservations(): Observable<InventoryExpiredReservationReleaseResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/reservations/release-expired', {}, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryExpiredReservationReleaseResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to release expired reservations'))),
      );
  }

  moveInventory(id: string, request: InventoryMoveRequest): Observable<InventoryItem> {
    return this.http
      .patch<unknown>(`/api/v1/inventory/${id}/move`, request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to move inventory'))),
      );
  }

  moveInventoryBatch(request: InventoryBulkMoveRequest): Observable<InventoryBulkMoveResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/move/batch', request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryBulkMoveResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to bulk move inventory'))),
      );
  }

  adjustInventoryQuantity(id: string, request: InventoryQuantityAdjustmentRequest): Observable<InventoryItem> {
    return this.http
      .patch<unknown>(`/api/v1/inventory/${id}/quantity`, request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to adjust inventory quantity'))),
      );
  }

  changeInventoryStatus(id: string, request: InventoryStatusChangeRequest): Observable<InventoryItem> {
    return this.http
      .patch<unknown>(`/api/v1/inventory/${id}/status`, request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to change inventory status'))),
      );
  }

  removeInventory(id: string, request: InventoryRemovalRequest): Observable<InventoryItem> {
    return this.http
      .delete<unknown>(`/api/v1/inventory/${id}`, { headers: this.authService.authHeaders(), body: request })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to remove inventory'))),
      );
  }

  scanInventory(request: InventoryScanRequest): Observable<InventoryItem> {
    return this.http
      .post<unknown>('/api/v1/inventory/scan', request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryItemSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Inventory scan rejected'))),
      );
  }

  scanInventoryBatch(request: InventoryBatchScanRequest): Observable<InventoryBatchScanResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/scan/batch', request, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryBatchScanResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Inventory batch scan rejected'))),
      );
  }

  getProvenance(id: string): Observable<InventoryProvenanceResponse> {
    return this.http
      .get<unknown>(`/api/v1/inventory/${id}/provenance`, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryProvenanceResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory provenance'))),
      );
  }

  getAnomalies(filters: InventoryAnomalyListRequest = {}): Observable<InventoryAnomalyListResponse> {
    let params = new HttpParams();
    if (filters.type) params = params.set('type', filters.type);
    if (filters.severity) params = params.set('severity', filters.severity);
    if (filters.detectedFrom) params = params.set('detectedFrom', filters.detectedFrom);
    if (filters.detectedTo) params = params.set('detectedTo', filters.detectedTo);
    return this.http
      .get<unknown>('/api/v1/inventory/anomalies', { headers: this.authService.authHeaders(), params })
      .pipe(
        map((raw) => InventoryAnomalyListResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory anomalies'))),
      );
  }

  detectAnomalies(): Observable<InventoryAnomalyListResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/anomalies/detect', {}, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryAnomalyListResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to detect inventory anomalies'))),
      );
  }

  getAlerts(filters: { type?: InventoryAlertType; severity?: InventoryAlertSeverity } = {}): Observable<InventoryAlertListResponse> {
    let params = new HttpParams();
    if (filters.type) params = params.set('type', filters.type);
    if (filters.severity) params = params.set('severity', filters.severity);
    return this.http
      .get<unknown>('/api/v1/inventory/alerts', { headers: this.authService.authHeaders(), params })
      .pipe(
        map((raw) => InventoryAlertListResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to fetch inventory alerts'))),
      );
  }

  generateAlerts(): Observable<InventoryAlertListResponse> {
    return this.http
      .post<unknown>('/api/v1/inventory/alerts/generate', {}, { headers: this.authService.authHeaders() })
      .pipe(
        map((raw) => InventoryAlertListResponseSchema.parse(raw)),
        catchError((error) => throwError(() => this.toError(error, 'Failed to generate inventory alerts'))),
      );
  }

  private toError(error: unknown, fallback: string): Error {
    if (error instanceof HttpErrorResponse) {
      const message =
        error.error && typeof error.error === 'object' && 'message' in error.error
          ? String((error.error as { message?: unknown }).message)
          : `${fallback}: ${error.status || 'network error'}`;
      return new Error(message);
    }
    return error instanceof Error ? error : new Error(fallback);
  }
}
