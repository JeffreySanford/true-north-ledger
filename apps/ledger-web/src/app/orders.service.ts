import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import {
  CreateOrderRequest,
  Order,
  OrderCancelRequest,
  OrderDetailResponse,
  OrderDetailResponseSchema,
  OrderListResponse,
  OrderListResponseSchema,
  OrderProof,
  OrderProofSchema,
  OrderProofVerificationResponse,
  OrderProofVerificationResponseSchema,
  OrderSchema,
  OrderSearchRequest,
  OrderStatus,
  OrderStatusUpdateRequest,
  OrderTimelineEvent,
  OrderTimelineEventSchema,
} from '@true-north-ledger/order-contracts';
import { AuthService } from './auth.service';

export type OrderListFilters = Partial<
  Pick<OrderSearchRequest, 'status' | 'customerId' | 'query' | 'createdFrom' | 'createdTo' | 'page' | 'pageSize' | 'sortBy' | 'sortDirection'>
>;

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  listOrders(filters: OrderListFilters = {}): Observable<OrderListResponse> {
    const params = this.toParams(filters);

    return this.http.get<unknown>('/api/v1/orders', { headers: this.authHeaders(), params }).pipe(
      map((raw) => this.parse(OrderListResponseSchema, raw, 'Order list response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch orders'))),
    );
  }

  searchOrders(filters: OrderListFilters = {}): Observable<OrderListResponse> {
    return this.http.get<unknown>('/api/v1/orders/search', { headers: this.authHeaders(), params: this.toParams(filters) }).pipe(
      map((raw) => this.parse(OrderListResponseSchema, raw, 'Order search response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to search orders'))),
    );
  }

  createOrder(request: CreateOrderRequest): Observable<Order> {
    return this.http.post<unknown>('/api/v1/orders', request, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderSchema, raw, 'Order creation response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to create order'))),
    );
  }

  getOrderById(id: string): Observable<OrderDetailResponse> {
    return this.http.get<unknown>(`/api/v1/orders/${id}`, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderDetailResponseSchema, raw, 'Order detail response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch order detail'))),
    );
  }

  updateOrderStatus(id: string, request: OrderStatusUpdateRequest): Observable<Order> {
    return this.http.patch<unknown>(`/api/v1/orders/${id}/status`, request, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderSchema, raw, 'Order status response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to update order status'))),
    );
  }

  cancelOrder(id: string, request: OrderCancelRequest): Observable<Order> {
    return this.http.post<unknown>(`/api/v1/orders/${id}/cancel`, request, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderSchema, raw, 'Order cancellation response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to cancel order'))),
    );
  }

  getOrderTimeline(id: string): Observable<OrderTimelineEvent[]> {
    return this.http.get<unknown>(`/api/v1/orders/${id}/timeline`, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderTimelineEventSchema.array(), raw, 'Order timeline response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to fetch order timeline'))),
    );
  }

  getOrderProof(id: string): Observable<OrderProof> {
    return this.http.get<unknown>(`/api/v1/orders/${id}/proof`, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderProofSchema, raw, 'Order proof response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to generate order proof'))),
    );
  }

  verifyOrderProof(proof: OrderProof): Observable<OrderProofVerificationResponse> {
    return this.http.post<unknown>('/api/v1/proofs/verify', { proof }, { headers: this.authHeaders() }).pipe(
      map((raw) => this.parse(OrderProofVerificationResponseSchema, raw, 'Proof verification response is invalid')),
      catchError((error) => throwError(() => this.toUserFacingError(error, 'Failed to verify proof'))),
    );
  }

  nextStatus(status: OrderStatus): OrderStatus | null {
    const flow: Partial<Record<OrderStatus, OrderStatus>> = {
      pending: 'confirmed',
      confirmed: 'processing',
      processing: 'shipped',
      shipped: 'delivered',
    };
    return flow[status] ?? null;
  }

  private authHeaders(): { Authorization?: string } {
    return this.authService.authHeaders();
  }

  private toParams(filters: OrderListFilters): HttpParams {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }

  private parse<T>(schema: { parse: (value: unknown) => T }, raw: unknown, message: string): T {
    try {
      return schema.parse(raw);
    } catch (error) {
      throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
