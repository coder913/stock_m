# Paper Trading E2E Coverage Design

## Goal

Exercise the user-visible Alpaca Paper lifecycle through the browser while keeping external brokerage behavior deterministic. The E2E server must use the same PostgreSQL outbox, BullMQ queue/worker, inbox deduplication, command handlers, ledger, and performance APIs as production.

## Scope

- Browser order entry, preview, confirmation, and queued success feedback.
- Browser cancellation from the order-history page.
- A timeline that retains partial fills, cancellation intent, and a later final fill.
- Paper ledger and performance updates after fills.
- A worker-only restart that preserves the fake broker's remote state.
- A genuine BullMQ redelivery using the original outbox event ID as the repeated job ID; PostgreSQL inbox consumption must suppress the duplicate.
- Retain lost-response recovery and broker-drift coverage.

## Test Runtime

The E2E application owns a real `trading-commands` BullMQ queue, a real BullMQ worker using `createTradingJobProcessor`, a `PostgresTradingInbox`, and an `OutboxPublisher`. The broker remains `FakeAlpacaTradingProvider`, so tests can deterministically create partial fills, terminal fills, cancellation acknowledgements, and drift.

The runtime exposes test-only controls to publish pending outbox rows, wait until the queue is idle, restart only the trading worker, and redeliver a selected completed job with the same job ID. These controls do not bypass production command handlers.

## Assertions

The primary browser scenario submits through `OrderTicket`, waits for worker processing, restarts the worker, redelivers the original submission job, and proves that the inbox and broker timeline remain unchanged. It then injects a partial fill, cancels through `PaperOrderHistory`, injects a final fill, and verifies both cancellation intent and final execution remain visible. Finally it verifies the ledger and performance page reflect the fills.

A secondary API-driven scenario retains recovery from an ambiguous submission response and reconciliation of broker drift.

## Reliability and Cleanup

Each reset closes the trading worker before flushing Redis, clears database fixtures, and recreates the worker. Server shutdown closes the worker, queue, publisher, and Redis connections. Queue-idle polling has a bounded timeout and reports job counts on failure.
