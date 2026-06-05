# Order Management

Sprint 3 introduces order lifecycle management as the first business workflow built on the authenticated ledger foundation.

## Current Scope

- Shared order contracts live in `libs/order-contracts` and are re-exported from `libs/shared-models`.
- The initial contract surface covers order creation, status updates, cancellation, search filters, timeline events, proof payloads, and proof verification responses.
- Backend and frontend implementations will use the shared schemas for request validation, response shaping, OpenAPI examples, and UI test fixtures.

## Lifecycle

Orders move through the primary happy path:

```text
pending -> confirmed -> processing -> shipped -> delivered
```

Terminal and exception states:

- `cancelled` for allowed pre-shipment cancellation.
- `failed` for rejected or failed order workflow outcomes.

Every accepted lifecycle write must create a ledger event with:

- `orderId`
- `orderNumber`
- `tenantId`
- `correlationId`
- previous and next status where applicable
- actor metadata
- reason or note for status changes and cancellations

## Contract Guarantees

- Order numbers use the `ORD-YYYYMMDD-NNNN` display shape.
- `correlationId` is required on order responses, timeline events, and proofs.
- Order totals are derived from item quantity and unit price.
- Status timeline events include non-color result labels: `accepted`, `rejected`, or `failed`.
- Proof payloads include all timeline events and a `proofHash`.

## Sprint 3 Implementation Order

1. Contract schemas and shared-model exports.
2. TypeORM order entity and migration.
3. Order service with creation, transition validation, cancellation, search, timeline, and proof behavior.
4. Controller/OpenAPI coverage.
5. Angular order service, list, create, detail, timeline, and proof views.
6. Unit, integration, and E2E coverage for each completed slice.
