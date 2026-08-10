# Alpaca Paper Trading Design

**Date:** 2026-08-10  
**Status:** Approved in design review  
**Depends on:** Completed server-persistence and background-monitoring milestones

## 1. Goal

Add a separate Alpaca Paper portfolio in which a user can submit manually confirmed long-only market and limit orders, track their lifecycle, cancel eligible orders and reconcile fills/account activities into an immutable broker ledger. No path may target a real-money account or submit an order automatically.

## 2. Portfolio Separation

The existing portfolio remains `manual` and preserves all imported history and performance behavior. Connecting Alpaca creates a separate `alpaca-paper` portfolio. A portfolio selector changes Overview, Ledger, Performance and Review context; records from the two portfolios are never merged.

The manual portfolio remains reconstructed from user ledger events. The Paper portfolio treats Alpaca orders, fills, account activities and positions as the external source of truth and stores an idempotent local mirror for analysis and audit.

## 3. Supported Trading Scope

- Buy and sell, long-only.
- Integer shares and fractional shares only where the Alpaca asset and order type permit them.
- Market and limit orders.
- DAY and GTC time in force, subject to Alpaca’s valid combinations.
- Cancel for orders that Alpaca reports as cancelable.
- No short selling, margin, options, bracket orders, stop orders, trailing stops or extended-hours orders.
- No monitor-created order intents and no automatic submission.

## 4. Configuration and Startup Safety

The Trading Worker reads Paper credentials only from server environment variables. `ALPACA_PAPER_TRADING_ENABLED` defaults to `false`. Startup validates the configured trading base URL against the exact approved Paper origin; an unknown or production trading origin fails worker readiness and leaves trading UI read-only.

API health exposes only `disabled`, `ready`, `degraded` or `misconfigured`; it never returns keys or credential fragments. The client bundle and browser network responses contain no Alpaca secret.

## 5. Order Intent and Confirmation Flow

### 5.1 Draft

Research and Paper Portfolio pages open the same order ticket. The user enters side, symbol, quantity, order type, optional limit price and time in force. Monitor links may open the ticket at a symbol but cannot populate quantity, confirm or submit it.

### 5.2 Server Preflight

`POST /api/v1/broker/alpaca-paper/order-previews` validates:

- Paper trading is enabled and the account/asset response is fresh;
- the symbol is active and tradable;
- quantity is positive and respects fractional/order-type rules;
- market orders have a fresh quote;
- limit orders have a finite positive explicit limit price;
- sell quantity does not exceed the fresh available long position;
- estimated buy notional does not exceed fresh buying power;
- DAY/GTC is valid for the selected order type.

The preview returns a short-lived signed preview token, estimated notional, quote source/as-of, buying power, position before/estimated after, concentration before/estimated after, and warnings about non-guaranteed execution. A preview is invalid after 60 seconds or any material input change.

### 5.3 Explicit Confirmation

The confirmation dialog repeats every order field and warning. The user must click a distinct “Submit to Alpaca Paper” action. The browser sends the preview token and a new `Idempotency-Key` to `POST /api/v1/broker/alpaca-paper/order-intents`.

The API verifies the token, stores an immutable confirmed intent and `broker.order.submit.requested` Outbox event in one transaction, and returns `pending_submission`. It does not call Alpaca inside the HTTP transaction.

## 6. Idempotent Broker Submission

The Trading Worker derives a deterministic Alpaca `client_order_id` from the local order intent ID. Before submission it checks for an already-linked remote order and then queries Alpaca by `client_order_id`.

- Remote order found: bind it and continue tracking.
- Explicitly not found: submit once with the deterministic ID.
- Timeout or ambiguous response: move the intent to `reconciling` and query by client ID; never blindly resubmit.
- Confirmed rejection: persist the mapped rejection code/message and close the intent.

Local order states are `draft`, `confirmed`, `pending_submission`, `reconciling`, `accepted`, `new`, `partially_filled`, `filled`, `cancel_pending`, `canceled`, `rejected` and `expired`. State transitions are append-only `broker_order_event` records; a current projection is rebuilt transactionally.

## 7. Cancellation

`POST /api/v1/broker/alpaca-paper/orders/:id/cancel-intents` requires a fresh local/remote status and an idempotency key. It appends a cancel intent and Outbox event. The Trading Worker sends the cancellation, then reconciles until Alpaca returns a terminal canceled/filled/rejected result. A cancel request can race with a fill; the final Alpaca status wins and both events remain in history.

## 8. Trade Updates and Reconciliation

The Trading Worker consumes Alpaca Trade Updates for low-latency status changes. REST reconciliation runs on startup, every 30 seconds for non-terminal orders, and every five minutes for account/position/activity snapshots.

Fills and account activities are keyed by Alpaca’s immutable IDs. Dividends, fees, splits and other supported activities map to the existing ledger vocabulary where semantics match; broker-specific details remain attached as provenance. Duplicate stream and REST observations converge on one record.

The broker ledger is reconstructed into cash, positions and performance inputs. The remote account cash/positions are compared with the local replay after every full reconciliation. A mismatch creates a `broker_drift` record with symbol/cash differences, marks Paper portfolio analytics unavailable, and disables new order confirmation until a successful full reconciliation clears the drift. History is never silently patched to make totals match.

## 9. Data Model and Ownership

The `broker` schema contains:

- `broker_account` and `broker_account_snapshot`;
- `order_preview_audit` without reusable signed tokens;
- `order_intent` and `cancel_intent`;
- `broker_order`, `broker_order_event` and current-order projection;
- `broker_fill` and `broker_activity`;
- `broker_ledger_event` with remote provenance and unique remote activity/fill IDs;
- `broker_reconciliation_run` and `broker_drift`.

Only the Trading Worker writes remote order/fill/activity state. The API writes confirmed user intents. UI reads projections and immutable history through `/api/v1/broker/alpaca-paper/*`.

## 10. Error Handling

- Missing/invalid credentials: portfolio is visible as disconnected; submission controls are absent.
- Paper API `401/403`: worker becomes misconfigured and stops consuming new submit jobs until configuration changes.
- `429/5xx`: safe reads retry with bounded backoff; order commands enter reconciliation before any retry.
- Trade stream disconnect: mark streaming degraded and rely on REST reconciliation; reconnect with backoff.
- Stale quote/account/asset: preview or confirmation is blocked with a specific freshness error.
- Partial fill: update filled quantity and average price; remaining quantity stays open/cancelable.
- Redis loss after database commit: Outbox republishes the command; deterministic client ID prevents a duplicate remote order.
- PostgreSQL unavailable: worker does not submit or cancel because it cannot durably record intent/result.

## 11. User Experience

The Paper portfolio shows account status, buying power, cash, positions, open orders and recent activity with Alpaca provenance/as-of. Order detail shows the full local/remote state timeline and reconciliation status.

The confirmation modal emphasizes “Paper” in title and action copy. Market orders show the fresh reference quote but state that execution price is not guaranteed. Limit orders show distance from current quote. A drift banner explains why performance and submission are blocked and provides a manual reconciliation action.

No paper order action appears in the manual portfolio. Monitoring and thesis pages may link to the Paper order ticket only when Paper is ready, and the user must still enter/confirm all economic terms.

## 12. Testing and Completion Criteria

- Unit tests cover preview validation, fractional rules, state transitions, client order ID derivation, activity mapping, replay and drift detection.
- Provider contract tests cover account, assets, orders, submit, cancel, pagination, Trade Updates, partial fills, `401`, `429`, `5xx` and ambiguous timeouts.
- PostgreSQL/Redis integration tests prove Outbox recovery, duplicate job delivery, timeout reconciliation and unique fill/activity constraints.
- Fixture-backed E2E covers Paper connection, market preview, limit preview, explicit confirmation, accepted, partial fill, cancellation race, final fill, performance refresh and drift blocking.
- A duplicate-submit E2E forces a lost response and queue redelivery and asserts one remote order for the deterministic client order ID.
- Live Paper smoke is read-only: authentication, account shape, asset lookup and order-list access. It never submits or cancels an order.
- Security scans reject production Alpaca origins, credentials in `dist`, and production imports of trading fixtures/testing routes.

Milestone 3 is complete only when every submitted fixture command produces at most one remote Paper order, all observed fills/activities enter one immutable broker ledger, manual and Paper portfolios remain isolated, and drift or stale critical data blocks trustworthy analytics and new confirmations.

## 13. Non-Goals

- Real-money trading.
- Automatic or condition-triggered submission.
- Shorting, margin, options or advanced order classes.
- Merging manual and Paper portfolio histories.
- Tax-lot optimization or tax reporting.
