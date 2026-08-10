# Alpaca Paper Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Alpaca Paper portfolio with manually confirmed long-only market/limit orders, idempotent submission/cancellation, trade-update plus REST reconciliation, and an immutable broker ledger.

**Architecture:** The public API validates order previews and persists confirmed user intents; it never calls Alpaca in the HTTP transaction. A dedicated `trading-worker` consumes Outbox commands, derives deterministic Alpaca client order IDs, reconciles ambiguous outcomes before retrying, ingests stream/REST order events and account activities, and projects an isolated Paper portfolio. Drift between remote state and local replay blocks new confirmation and trustworthy analytics.

**Tech Stack:** TypeScript, Fastify, PostgreSQL/Kysely, Redis/BullMQ, Alpaca Paper REST and Trade Updates WebSocket, React, Vitest, Playwright, Docker Compose

## Global Constraints

- Requires completed server-persistence and background-monitoring plans.
- `ALPACA_PAPER_TRADING_ENABLED` defaults to `false`.
- Reject startup/readiness for an unapproved or production Alpaca trading base URL.
- Credentials remain in server `.env`; never return or bundle them.
- Alpaca Paper is a separate portfolio from the existing manual simulated portfolio.
- Orders are user-created and explicitly confirmed; monitors cannot create, confirm or submit an intent.
- Support long-only market/limit DAY/GTC orders and Alpaca-valid integer/fractional quantities.
- Exclude real-money trading, shorting, margin, options, stops, brackets, trailing stops and extended hours.
- Every submit/cancel uses a durable intent, public idempotency key and deterministic Alpaca client order ID.
- Never blindly retry an ambiguous broker command.
- Remote fills/account activities are idempotent immutable broker-ledger inputs.
- Drift or stale critical account/asset data blocks new confirmations and trusted Paper analytics.

---

### Task 1: Paper-Only Configuration and Alpaca Trading Contracts

**Files:**
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`
- Create: `shared/broker.ts`
- Create: `server/broker/alpacaTradingProvider.ts`
- Create: `server/broker/alpacaTradingProvider.test.ts`
- Create: `server/testing/fixtures/alpaca-paper-account.json`
- Create: `server/testing/fixtures/alpaca-paper-assets.json`
- Create: `server/testing/fixtures/alpaca-paper-orders.json`
- Create: `server/testing/fixtures/alpaca-paper-activities.json`

**Interfaces:**
- Produces: `AlpacaTradingProvider` for account, asset, order, cancel, activities and order-by-client-ID operations.
- Produces: normalized `shared/broker.ts` domain types used by server and browser tasks.

- [ ] **Step 1: Add failing configuration safety tests**

```ts
test("rejects the production trading origin", () => {
  expect(() => loadServerConfig(env({ ALPACA_TRADING_BASE_URL: "https://api.alpaca.markets", ALPACA_PAPER_TRADING_ENABLED: "true" }))).toThrow("Paper");
});

test("keeps paper trading disabled by default", () => {
  expect(loadServerConfig(env()).paperTrading.enabled).toBe(false);
});
```

- [ ] **Step 2: Write failing provider contract tests**

Cover Paper account normalization, asset fractional/tradable flags, paginated orders/activities, submit payload mapping, cancel, lookup by `client_order_id`, `401`, `429`, `5xx` and timeout classification.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- server/config.test.ts server/broker/alpacaTradingProvider.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Define normalized broker contracts**

```ts
export type BrokerOrderStatus = "accepted" | "new" | "partially_filled" | "filled" | "canceled" | "rejected" | "expired";
export type PaperOrderType = "market" | "limit";
export type PaperTimeInForce = "day" | "gtc";

export interface PaperOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  type: PaperOrderType;
  timeInForce: PaperTimeInForce;
  limitPrice?: string;
}

export interface AlpacaTradingPort {
  getAccount(): Promise<BrokerAccountSnapshot>;
  getAsset(symbol: string): Promise<BrokerAsset>;
  submitOrder(input: PaperOrderRequest): Promise<BrokerOrder>;
  cancelOrder(remoteOrderId: string): Promise<void>;
  getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | undefined>;
  listOpenOrders(): Promise<BrokerOrder[]>;
  listActivities(after?: string): Promise<BrokerActivity[]>;
}
```

Add `ws` to dependencies and `@types/ws` to devDependencies for the later Trade Updates consumer; do not rely on a runtime-global WebSocket. All normalized broker types live in `shared/broker.ts`.

- [ ] **Step 5: Implement Paper provider and strict origin gate**

Use the Paper REST origin from validated config, explicit request timeouts, provider error mapping and pagination. A production or non-allowlisted origin prevents readiness even when credentials are valid.

- [ ] **Step 6: Run tests/build and commit**

Run: `npm test -- server/config.test.ts server/broker/alpacaTradingProvider.test.ts`  
Run: `npm run build`  
Expected: PASS.

```bash
git add .env.example package.json package-lock.json server/config* shared/broker.ts server/broker/alpacaTradingProvider* server/testing/fixtures/alpaca-paper-*.json
git commit -m "feat: add paper trading provider contracts"
```

### Task 2: Broker Schema, Order State Machine, and Repositories

**Files:**
- Create: `server/db/migrations/011_broker.ts`
- Create: `server/broker/orderStateMachine.ts`
- Create: `server/broker/orderStateMachine.test.ts`
- Create: `server/broker/brokerRepository.ts`
- Create: `server/broker/brokerRepository.integration.test.ts`
- Create: `server/broker/clientOrderId.ts`
- Create: `server/broker/clientOrderId.test.ts`

**Interfaces:**
- Produces: immutable order/cancel intents, remote order events, fills/activities, account snapshots, ledger events and drift records.
- Produces: deterministic `clientOrderIdFor(intentId)`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
expect(transition("pending_submission", "remote.accepted")).toBe("accepted");
expect(transition("partially_filled", "remote.filled")).toBe("filled");
expect(() => transition("filled", "remote.new")).toThrow("INVALID_BROKER_TRANSITION");
expect(transition("cancel_pending", "remote.filled")).toBe("filled");
```

Cover every allowed terminal/non-terminal transition and duplicate remote event no-op.

- [ ] **Step 2: Write failing repository/id tests**

Assert stable client IDs fit Alpaca length/character rules, duplicate remote order/fill/activity IDs insert once, order projections rebuild from events, and numeric strings round-trip exactly.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- server/broker/orderStateMachine.test.ts server/broker/clientOrderId.test.ts`  
Run: `npm run test:integration -- server/broker/brokerRepository.integration.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Create broker tables and constraints**

Migration creates `broker.account`, `account_snapshot`, `order_preview_audit`, `order_intent`, `cancel_intent`, `remote_order`, `order_event`, `order_projection`, `fill`, `activity`, `ledger_event`, `reconciliation_run` and `drift`. Unique keys include local intent ID, client order ID, remote order ID, fill ID and activity ID.

- [ ] **Step 5: Implement pure state machine and repositories**

Append an `order_event` and update `order_projection` in one transaction. Never update/delete immutable intent, event, fill, activity or ledger rows. Store quantities/money as decimal strings at boundaries and `numeric(28,8)` in PostgreSQL.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- server/broker/orderStateMachine.test.ts server/broker/clientOrderId.test.ts`  
Run: `npm run test:integration -- server/broker/brokerRepository.integration.test.ts`  
Expected: PASS.

```bash
git add server/db/migrations/011_broker.ts server/broker/orderStateMachine* server/broker/brokerRepository* server/broker/clientOrderId*
git commit -m "feat: persist paper order lifecycle"
```

### Task 3: Order Preview, Preflight, and Confirmation API

**Files:**
- Create: `server/broker/orderPreviewService.ts`
- Create: `server/broker/orderPreviewService.test.ts`
- Create: `server/broker/orderPreviewToken.ts`
- Create: `server/broker/orderPreviewToken.test.ts`
- Create: `server/routes/paperTradingRoutes.ts`
- Create: `server/routes/paperTradingRoutes.test.ts`
- Modify: `server/app.ts`
- Modify: `server/config.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: 60-second signed preview and confirmed `order_intent` + Outbox command.
- Consumes: fresh market quote, account, asset and current Paper position.

- [ ] **Step 1: Add failing preflight table tests**

Test long-only rules for market/limit, DAY/GTC, integer/fractional assets, stale quote, stale account, insufficient buying power, over-sell, invalid price, disabled trading and active drift.

```ts
await expect(service.preview({ side: "sell", quantity: "2", position: "1", ...base })).rejects.toMatchObject({ code: "INSUFFICIENT_PAPER_POSITION" });
await expect(service.preview({ type: "market", quoteState: "stale", ...base })).rejects.toMatchObject({ code: "FRESH_QUOTE_REQUIRED" });
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/broker/orderPreviewService.test.ts server/broker/orderPreviewToken.test.ts server/routes/paperTradingRoutes.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement preview validation and signed token**

```ts
export interface OrderPreview {
  previewId: string;
  expiresAt: string;
  normalizedOrder: Omit<PaperOrderRequest, "clientOrderId">;
  estimatedNotional: string;
  quote: { price: string; source: string; asOf: string };
  buyingPower: string;
  positionBefore: string;
  estimatedPositionAfter: string;
  concentrationBefore?: number;
  estimatedConcentrationAfter?: number;
  warnings: string[];
  token: string;
}
```

Sign canonical preview claims with HMAC-SHA256 and a separate server key. Verify signature, expiry and exact economic fields during confirmation. Store only preview audit metadata, never a reusable token.

- [ ] **Step 4: Implement preview and intent routes**

`POST /api/v1/broker/alpaca-paper/order-previews` performs fresh reads and returns the preview. `POST /order-intents` requires preview token plus `Idempotency-Key`, revalidates enabled/drift status, and writes confirmed intent + `broker.order.submit.requested` Outbox in one transaction.

Register the route group in `buildApp`; `server/index.ts` constructs the Paper provider, preview service and broker repository only from validated server configuration.

- [ ] **Step 5: Verify monitor API cannot create an intent**

Add a route surface test enumerating all monitor routes and asserting none accepts order economic fields or imports the broker repository.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- server/broker/orderPreview* server/routes/paperTradingRoutes.test.ts`  
Run: `npm run test:integration -- server/broker/brokerRepository.integration.test.ts`  
Expected: PASS.

```bash
git add server/broker/orderPreview* server/routes/paperTradingRoutes* server/app.ts server/config.ts server/index.ts
git commit -m "feat: preview and confirm paper orders"
```

### Task 4: Order Ticket and Explicit Confirmation UI

**Files:**
- Modify: `shared/broker.ts`
- Create: `src/features/trading/paperTradingApiClient.ts`
- Create: `src/features/trading/paperTradingApiClient.test.ts`
- Create: `src/features/trading/OrderTicket.tsx`
- Create: `src/features/trading/OrderTicket.test.tsx`
- Create: `src/features/trading/OrderConfirmationDialog.tsx`
- Create: `src/features/trading/OrderConfirmationDialog.test.tsx`
- Create: `src/features/trading/trading.css`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`

**Interfaces:**
- Consumes: Task 3 preview/intent endpoints.
- Produces: explicit user-only order workflow; no direct provider call.

- [ ] **Step 1: Write failing interaction tests**

```tsx
await user.type(screen.getByLabelText("数量"), "1.5");
await user.click(screen.getByRole("button", { name: "预览订单" }));
expect(await screen.findByText("Alpaca Paper 订单确认")).toBeVisible();
expect(api.createIntent).not.toHaveBeenCalled();
await user.click(screen.getByRole("button", { name: "提交到 Alpaca Paper" }));
expect(api.createIntent).toHaveBeenCalledWith(expect.objectContaining({ previewToken: "signed" }), expect.any(String));
```

Cover disabled/disconnected, drift, stale quote, fractional invalid, market/limit fields, DAY/GTC, expired preview, duplicate click and rejected submission.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/features/trading`  
Expected: FAIL.

- [ ] **Step 3: Implement API client and form validation**

The client imports request/response contracts from `shared/broker.ts` and uses shared API error mapping. The form normalizes symbols uppercase and quantities/prices as decimal strings; client validation is convenience only and server errors remain authoritative.

- [ ] **Step 4: Implement confirmation dialog safety copy**

Repeat side, symbol, quantity, type, limit price, TIF, estimated notional, quote provenance, buying power and concentration change. Title and primary action both contain “Alpaca Paper”. Disable confirmation after preview expiry or first click.

- [ ] **Step 5: Add Research/Portfolio entry points**

Research opens a blank-economics ticket scoped only to the current symbol. Paper Portfolio provides buy/sell buttons. Manual Portfolio renders no order action. Monitor links may navigate to `?tradeSymbol=NVDA` but cannot set side/quantity/type.

- [ ] **Step 6: Run UI regression/build and commit**

Run: `npm test -- src/features/trading src/features/research src/features/portfolio src/features/monitoring`  
Run: `npm run build`  
Expected: PASS.

```bash
git add shared/broker.ts src/features/trading src/features/research/ResearchPage.tsx src/features/portfolio/PortfolioPage.tsx
git commit -m "feat: add explicit paper order ticket"
```

### Task 5: Trading Worker Idempotent Submission and Cancellation

**Files:**
- Modify: `docker-compose.yml`
- Modify: `package.json`
- Create: `server/workers/tradingWorker.ts`
- Create: `server/broker/orderCommandService.ts`
- Create: `server/broker/orderCommandService.test.ts`
- Create: `server/broker/orderCommandService.integration.test.ts`
- Create: `server/broker/cancelCommandService.ts`
- Create: `server/broker/cancelCommandService.test.ts`
- Modify: `server/routes/paperTradingRoutes.ts`
- Modify: `server/routes/paperTradingRoutes.test.ts`

**Interfaces:**
- Consumes: submit/cancel Outbox events through Inbox dedupe.
- Produces: safe remote order binding and local lifecycle events.

- [ ] **Step 1: Write failing lost-response tests**

```ts
provider.submitOrder.mockRejectedValueOnce(new BrokerAmbiguousError("timeout"));
provider.getOrderByClientOrderId.mockResolvedValueOnce(remoteAccepted);
await service.submit(intentEvent);
await service.submit(intentEvent);
expect(provider.submitOrder).toHaveBeenCalledTimes(1);
expect((await repository.getProjection(intent.id)).remoteOrderId).toBe(remoteAccepted.id);
```

Also test remote order found before submit, explicit not-found then one submit, ambiguous lookup remains reconciling, `429/5xx`, rejection and duplicate BullMQ delivery.

- [ ] **Step 2: Write failing cancel race tests**

Cover cancel accepted, duplicate cancel, fill winning while cancel pending, already terminal order and ambiguous cancel timeout.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- server/broker/orderCommandService.test.ts server/broker/cancelCommandService.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement submission reconciliation algorithm**

Before submit, load projection and query deterministic client ID. Submit only after an explicit not-found result. On timeout write `reconciling`, schedule a lookup job and never call submit in the same ambiguous branch. Bind/create remote order and append mapped events transactionally.

- [ ] **Step 5: Implement durable cancellation intents**

Route creates immutable cancel intent + Outbox under idempotency. Worker sends cancel for eligible remote states and always follows with reconciliation; final fill/cancel status comes from Alpaca.

- [ ] **Step 6: Add trading-worker Compose service**

Add `"worker:trading": "tsx server/workers/tradingWorker.ts"` to `package.json`. Compose runs it with one worker concurrency, no published port, and readiness false unless Paper config passes and PostgreSQL/Redis are healthy. Disabled trading consumes no broker command.

- [ ] **Step 7: Run unit/integration tests and commit**

Run: `npm test -- server/broker/orderCommandService.test.ts server/broker/cancelCommandService.test.ts server/routes/paperTradingRoutes.test.ts`  
Run: `npm run test:integration -- server/broker/orderCommandService.integration.test.ts`  
Expected: PASS.

```bash
git add docker-compose.yml package.json server/workers/tradingWorker.ts server/broker/orderCommandService* server/broker/cancelCommandService* server/routes/paperTradingRoutes*
git commit -m "feat: submit and cancel paper orders safely"
```

### Task 6: Trade Updates, REST Reconciliation, and Broker Ledger

**Files:**
- Create: `server/broker/alpacaTradeUpdates.ts`
- Create: `server/broker/alpacaTradeUpdates.test.ts`
- Create: `server/broker/brokerActivityMapper.ts`
- Create: `server/broker/brokerActivityMapper.test.ts`
- Create: `server/broker/brokerLedger.ts`
- Create: `server/broker/brokerLedger.test.ts`
- Create: `server/broker/reconciliationService.ts`
- Create: `server/broker/reconciliationService.test.ts`
- Create: `server/broker/reconciliationService.integration.test.ts`
- Modify: `server/workers/tradingWorker.ts`

**Interfaces:**
- Produces: stream plus REST convergence, broker ledger and account/position drift records.

- [ ] **Step 1: Write failing stream and activity mapping tests**

Cover authenticated stream reconnect, duplicate sequence/events, accepted/new/partial/fill/cancel/reject mapping, dividends, fees, splits and unknown activities retained as provenance without fabricating ledger semantics.

```ts
expect(mapActivity(dividend)).toMatchObject({ type: "dividend", amount: "12.34", remoteActivityId: dividend.id });
expect(mapActivity(split)).toMatchObject({ type: "split", quantityMultiplier: "4" });
```

- [ ] **Step 2: Write failing reconciliation/drift tests**

Rebuild cash/positions from fills/activities, compare exact decimal totals with remote account, create drift on cash/symbol mismatch, and clear only after a later full successful reconciliation.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- server/broker/alpacaTradeUpdates.test.ts server/broker/brokerActivityMapper.test.ts server/broker/brokerLedger.test.ts server/broker/reconciliationService.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement Trade Updates consumer**

Authenticate, subscribe, heartbeat, reconnect with bounded exponential backoff, and write each remote event through unique remote event/order IDs. Stream degradation updates worker health but does not stop REST reconciliation.

- [ ] **Step 5: Implement scheduled REST reconciliation**

On startup and every 30 seconds reconcile non-terminal orders; every five minutes load account, positions and activities since the last cursor. Store a reconciliation run with source as-of and exact differences.

- [ ] **Step 6: Implement immutable broker ledger replay**

Map fills and supported activities to broker ledger events keyed by remote IDs. Do not mutate history to resolve drift. Provide `replayBrokerPortfolio(events)` returning cash, positions and provenance for UI/performance adapters.

- [ ] **Step 7: Run unit/integration tests and commit**

Run: `npm test -- server/broker`  
Run: `npm run test:integration -- server/broker/reconciliationService.integration.test.ts`  
Expected: PASS.

```bash
git add server/broker server/workers/tradingWorker.ts
git commit -m "feat: reconcile paper account activity"
```

### Task 7: Paper Portfolio Views, Performance Adapter, and Drift Blocking

**Files:**
- Create: `server/routes/paperPortfolioRoutes.ts`
- Create: `server/routes/paperPortfolioRoutes.test.ts`
- Create: `src/features/portfolio/portfolioSelection.ts`
- Create: `src/features/portfolio/portfolioSelection.test.ts`
- Create: `src/features/trading/PaperPortfolioOverview.tsx`
- Create: `src/features/trading/PaperPortfolioOverview.test.tsx`
- Create: `src/features/trading/PaperOrderHistory.tsx`
- Create: `src/features/trading/PaperOrderHistory.test.tsx`
- Create: `src/features/trading/BrokerDriftBanner.tsx`
- Create: `src/features/trading/BrokerDriftBanner.test.tsx`
- Create: `src/features/portfolio/performance/brokerPerformanceAdapter.ts`
- Create: `src/features/portfolio/performance/brokerPerformanceAdapter.test.ts`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/PortfolioPerformanceTab.tsx`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: broker account/order/ledger projections.
- Produces: isolated manual/Paper portfolio routing and compatible performance input.

- [ ] **Step 1: Add failing selection and isolation tests**

Assert manual is default when Paper disabled, selection persists as a non-business UI preference, Paper data never appears in manual totals/history, and manual ledger events never enter Paper analytics.

- [ ] **Step 2: Add failing drift/performance tests**

```ts
render(<BrokerDriftBanner drift={cashDrift} />);
expect(screen.getByRole("alert")).toHaveTextContent("对账不一致");
expect(screen.getByRole("button", { name: "提交到 Alpaca Paper" })).toBeDisabled();
expect(adaptBrokerPerformance(driftedPortfolio).dataState).toBe("unavailable");
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/features/trading src/features/portfolio/portfolioSelection.test.ts src/features/portfolio/performance/brokerPerformanceAdapter.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement Paper portfolio API views**

Expose health, latest account, positions, open/history orders, activities, immutable timeline, ledger and reconciliation/drift. Responses include remote source/as-of and streaming/reconciliation health.

Register the Paper portfolio read/action routes with broker repository and reconciliation command dependencies in `buildApp` and `server/index.ts`.

- [ ] **Step 5: Implement portfolio selector and Paper tabs**

Portfolio route selects `manual` or `alpaca-paper`. Paper Overview shows cash, buying power, positions and provenance; Orders shows status/timeline/cancel; Performance uses broker ledger plus market bars. Manual tabs retain current behavior.

- [ ] **Step 6: Block unsafe views/actions during drift**

When active drift exists, show exact cash/symbol differences, hide trustworthy performance metrics behind unavailable state, disable preview/confirmation, and provide a manual reconciliation command that enqueues—not directly executes—a full run.

- [ ] **Step 7: Run frontend/route tests and commit**

Run: `npm test -- src/features/trading src/features/portfolio server/routes/paperPortfolioRoutes.test.ts`  
Run: `npm run build`  
Expected: PASS.

```bash
git add server/routes/paperPortfolioRoutes* server/app.ts server/index.ts src/features/trading src/features/portfolio
git commit -m "feat: add isolated paper portfolio"
```

### Task 8: Fixture Trading Service and End-to-End Order Lifecycle

**Files:**
- Create: `server/testing/fakeAlpacaTradingProvider.ts`
- Create: `server/testing/fakeTradeUpdateStream.ts`
- Modify: `server/testing/createFixtureProviders.ts`
- Modify: `server/testing/e2eServer.ts`
- Create: `tests/e2e/alpaca-paper-trading.spec.ts`
- Modify: `docker-compose.test.yml`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: deterministic account, order, fill, timeout, cancellation race and drift controls for Chrome E2E only.

- [ ] **Step 1: Write failing happy-path and partial-fill E2E**

Connect fixture Paper account, switch portfolio, create a market preview, verify confirmation details, submit, observe accepted then partial fill then final fill, and assert positions/ledger/performance update.

- [ ] **Step 2: Add limit/cancel race flow**

Submit a GTC limit order, request cancel, inject a fill before cancel acknowledgment, and assert final filled status with both cancel intent and fill retained in timeline.

- [ ] **Step 3: Add ambiguous submit and queue redelivery flow**

Fixture accepts the order but drops the response. Redeliver the BullMQ event. Assert one remote order exists for the deterministic client order ID and local state reconciles to accepted.

- [ ] **Step 4: Add drift and safety flow**

Change remote fixture cash/position outside the local ledger, run reconciliation, assert drift banner, unavailable performance and disabled submit. Verify a production Alpaca base URL makes worker readiness fail.

- [ ] **Step 5: Implement test-only broker controls**

Controls advance order state, inject fills/activities, drop one response and mutate remote account. Register them only in the fixture E2E server; production provider has no mutation/testing methods.

- [ ] **Step 6: Run E2E**

Run: `npm run test:e2e -- tests/e2e/alpaca-paper-trading.spec.ts`  
Expected: PASS for happy path, cancel race, ambiguous submit and drift.

- [ ] **Step 7: Commit Task 8**

```bash
git add server/testing tests/e2e/alpaca-paper-trading.spec.ts docker-compose.test.yml playwright.config.ts
git commit -m "test: cover paper order lifecycle"
```

### Task 9: Read-Only Live Smoke, Documentation, Scans, and Completion

**Files:**
- Modify: `server/testing/liveSmoke.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/runbooks/alpaca-paper-reconciliation.md`
- Modify: `docs/superpowers/plans/2026-08-10-alpaca-paper-trading.md`

**Interfaces:**
- Produces: safe operator guidance and final verification evidence.

- [ ] **Step 1: Add read-only Paper smoke checks**

When Paper config is enabled, smoke reads account shape, one asset, open-order list and activity list. It contains no call to submit/cancel endpoints and fails a static guard if those provider methods are referenced.

- [ ] **Step 2: Document configuration and reconciliation operations**

README documents Paper-only base URL, enable flag, supported orders, manual confirmation, portfolio isolation and read-only smoke. Runbook documents worker health, reconciling commands, stream degradation, drift inspection and the rule against editing ledger rows.

- [ ] **Step 3: Run complete fresh validation**

Run: `npm test`  
Run: `npm run test:integration`  
Run: `npm run build`  
Run: `npm run test:e2e`  
Run: `npm run test:data:smoke`  
Expected: all commands exit 0.

- [ ] **Step 4: Run trading safety scans**

Assert:

```text
Alpaca/VAPID secret names or values in dist = 0
production Alpaca trading origin literals = 0 except allowlist validator tests
production fake/fixture trading imports = 0
production /api/testing routes = 0
monitor-to-order-intent imports/calls = 0
submitOrder or cancelOrder references in liveSmoke.ts = 0
```

- [ ] **Step 5: Mark all plan checkboxes complete**

Only update checkboxes after fresh validation and scans pass. Record the exact commands and counts in the final implementation commit message/body or handoff.

- [ ] **Step 6: Commit Task 9**

```bash
git add server/testing/liveSmoke.ts README.md .env.example docs/runbooks/alpaca-paper-reconciliation.md docs/superpowers/plans/2026-08-10-alpaca-paper-trading.md
git commit -m "docs: complete paper trading milestone"
```
