# Portfolio Performance Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy, browser-local portfolio performance reconstruction with external cash flows, split adjustments, SPY/custom benchmarks, TWR/MWR, drawdown, and reconciled contribution analysis.

**Architecture:** Fastify and the Alpaca adapter provide paginated batch daily bars and normalized split candidates through the existing cached `DataEnvelope` boundary. Browser-side repositories retain immutable user data, while pure performance modules reconstruct daily valuation and calculate metrics and attribution; React only orchestrates loading and presentation.

**Tech Stack:** TypeScript, React, Fastify, Zod, better-sqlite3, Recharts, Vitest, Testing Library, Playwright, stable Chrome.

## Global Constraints

- Portfolio settings, ledger events, ignored split decisions, and derived analysis cache remain browser-local; never send the ledger to Fastify.
- `PortfolioSettings.version` is exactly `1`; `baseCurrency` is exactly `USD`.
- Default migration uses `initialCash = 10_000` and `benchmarkSymbol = "SPY"`.
- Batch bars accept 1–100 unique symbols and `timeframe=1Day` only.
- Holdings use `adjustment=raw`; benchmarks use `adjustment=all`.
- Apply a confirmed split before every other ledger event on its effective market date.
- Carry a missing held-symbol close for at most 5 trading days; the sixth missing day is `unavailable`.
- Annualized return requires at least 30 natural days of continuous valid history.
- Daily contribution tolerance is `1e-10`; linked TWR contribution tolerance is `1e-8`; money reconciliation tolerance is `0.01 USD`.
- Never value a missing holding at zero, bridge an unavailable chart segment, or display a failed reconciliation as precise.
- Use existing Recharts; add no chart/date/state library, authentication, cloud persistence, broker integration, Brinson attribution, tax-lot accounting, multi-currency, or multi-portfolio support.
- Keep the current single-symbol bars route and all existing pages backward compatible.
- Preserve user-owned `readme_work.md` and `chrome/`; do not stage them unless separately requested.
- Follow TDD: verify every new test fails for the intended missing behavior before implementation.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/features/market/apiDomain.ts` | Bar-adjustment, batch-bars, and split-event contracts |
| `src/features/market/marketApiClient.ts` | Browser batch-bars request |
| `server/providers/alpacaProvider.ts` | Paginated batch bars and split normalization |
| `server/routes/marketRoutes.ts` | Validated cached batch-bars route |
| `server/testing/createFixtureProviders.ts` | Deterministic bar history and split candidates |
| `src/features/portfolio/domain.ts` | Extended ledger and current-portfolio contracts |
| `src/features/portfolio/portfolioSettingsRepository.ts` | Versioned settings and legacy migration |
| `src/features/portfolio/portfolioLedger.ts` | Immutable deposit, withdrawal, and split events |
| `src/features/portfolio/splitDecisionRepository.ts` | Validated ignored-split decisions |
| `src/features/portfolio/performance/domain.ts` | Performance input/output contracts |
| `src/features/portfolio/performance/performanceHistoryLoader.ts` | Bar/event loading and data-quality merge |
| `src/features/portfolio/performance/performanceCacheRepository.ts` | Derived-result content-addressed cache |
| `src/features/portfolio/performance/portfolioPerformanceEngine.ts` | Daily valuation, Dietz, TWR, benchmark, and drawdown |
| `src/features/portfolio/performance/xirr.ts` | Bounded XIRR solver |
| `src/features/portfolio/performance/performanceAttribution.ts` | Money and return contribution |
| `src/features/portfolio/performance/usePortfolioPerformance.ts` | React loading/cache/recompute orchestration |
| `src/features/portfolio/PortfolioPerformanceTab.tsx` | Performance workspace composition |
| `src/features/portfolio/PerformanceChart.tsx` | Normalized value and drawdown charts |
| `src/features/portfolio/PerformanceSummary.tsx` | Metric cards and unavailable reasons |
| `src/features/portfolio/PerformanceAttributionTable.tsx` | Contribution and cash-flow tables |
| `src/features/portfolio/SplitReviewPanel.tsx` | Split confirm/edit/ignore/manual workflow |
| `src/features/portfolio/PortfolioSettingsDialog.tsx` | Portfolio settings workflow |
| `src/features/portfolio/PortfolioPage.tsx` | Performance tab and cash-flow controls |
| `tests/e2e/portfolio-performance.spec.ts` | Deterministic browser workflow |

---

### Task 1: Paginated Batch Daily Bars

**Files:**
- Modify: `src/features/market/apiDomain.ts`
- Modify: `src/features/market/marketApiClient.ts`
- Create: `src/features/market/marketApiClient.test.ts`
- Modify: `server/providers/alpacaProvider.ts`
- Modify: `server/providers/alpacaProvider.test.ts`
- Modify: `server/routes/marketRoutes.ts`
- Modify: `server/routes/marketRoutes.test.ts`
- Modify: `server/testing/createFixtureProviders.ts`
- Create: `server/testing/fixtures/alpaca-batch-bars-page-1.json`
- Create: `server/testing/fixtures/alpaca-batch-bars-page-2.json`

**Interfaces:**
- Produces `BarsAdjustment`, `BatchPriceBars`, `AlpacaProvider.getBatchBars`, `MarketProvider.getBatchBars`, and `MarketApiClient.getBatchBars`.
- Preserves `AlpacaProvider.getBars(symbol, query)` and `/api/market/bars/:symbol`.

- [x] **Step 1: Add failing provider pagination tests and fixtures**

Create page fixtures:

```json
{ "bars": { "NVDA": [{ "t": "2026-08-06T04:00:00Z", "o": 160, "h": 168, "l": 159, "c": 167, "v": 50000000 }] }, "next_page_token": "page-2" }
```

```json
{ "bars": { "MSFT": [{ "t": "2026-08-06T04:00:00Z", "o": 500, "h": 507, "l": 498, "c": 505, "v": 20000000 }] }, "next_page_token": null }
```

Test URL and pagination:

```ts
test("loads every batch-bars page and forwards adjustment", async () => {
  const urls: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input); urls.push(url);
    const file = url.includes("page_token=page-2") ? "alpaca-batch-bars-page-2.json" : "alpaca-batch-bars-page-1.json";
    return new Response(readFileSync(new URL(`../testing/fixtures/${file}`, import.meta.url), "utf8"), { status: 200 });
  };
  const provider = new AlpacaProvider({ keyId: "id", secretKey: "secret" }, fetcher as typeof fetch);
  const result = await provider.getBatchBars(["NVDA", "MSFT", "NVDA"], { timeframe: "1Day", start: "2026-08-01", end: "2026-08-10", adjustment: "all", feed: "delayed_sip" });
  expect(urls[0]).toContain("symbols=NVDA%2CMSFT");
  expect(urls[0]).toContain("adjustment=all");
  expect(urls[1]).toContain("page_token=page-2");
  expect(result.data.symbols.NVDA[0]).toMatchObject({ close: 167, adjusted: true });
  expect(result.data.symbols.MSFT[0]).toMatchObject({ close: 505, adjusted: true });
});
```

- [x] **Step 2: Run the provider test and verify RED**

Run `npm test -- --run server/providers/alpacaProvider.test.ts`.

Expected: FAIL because `getBatchBars` does not exist.

- [x] **Step 3: Add contracts and provider implementation**

```ts
export type BarsAdjustment = "raw" | "split" | "dividend" | "all";
export interface BatchPriceBars { symbols: Record<string, PriceBar[]>; missingSymbols: string[]; }
```

Implement a `do/while` pagination loop over Alpaca `/v2/stocks/bars`, passing `symbols`, `timeframe`, `start`, `end`, `feed`, `adjustment`, `limit=10000`, and optional `page_token`. Initialize an array for every requested symbol, sort each result by `startedAt`, set `adjusted = adjustment !== "raw"`, and return requested symbols with no bars in `missingSymbols`.

Add `getBatchBars` to `createFixtureProviders().alpaca` in this task so `server/testing/e2eServer.ts` continues to satisfy `MarketProvider` and Task 1 can build independently. Return one deterministic bar per requested symbol; Task 2 expands this fixture to the full performance timeline.

- [x] **Step 4: Add failing route and browser-client tests**

```ts
test("serves cached batch daily bars", async () => {
  const getBatchBars = vi.fn().mockResolvedValue({ source: "alpaca", asOf: "2026-08-06T04:00:00Z", data: { symbols: { NVDA: [bar("NVDA")] }, missingSymbols: ["MSFT"] } });
  const app = createApp({ getBatchBars });
  const response = await app.inject({ method: "GET", url: "/api/market/bars?symbols=NVDA,MSFT&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=raw" });
  expect(response.statusCode).toBe(200);
  expect(getBatchBars).toHaveBeenCalledWith(["NVDA", "MSFT"], expect.objectContaining({ adjustment: "raw", timeframe: "1Day" }));
  expect(response.json().data.missingSymbols).toEqual(["MSFT"]);
});
```

Add table tests for zero symbols, 101 symbols, invalid characters, `1Min`, reversed dates, and invalid adjustment. Create a browser-client test asserting sorted encoded symbols and `adjustment=all`.

Modify the existing route-test `createApp` helper to accept `marketOverrides: Partial<MarketProvider>`, provide a default `getBatchBars`, and spread the override last. This makes the snippet above fully local to `marketRoutes.test.ts`.

- [x] **Step 5: Run route/client tests and verify RED**

Run:

```powershell
npm test -- --run server/routes/marketRoutes.test.ts src/features/market/marketApiClient.test.ts
```

Expected: FAIL because the route and client method are absent.

- [x] **Step 6: Implement route and client**

Extend `MarketProvider` with:

```ts
getBatchBars(symbols: string[], query: { timeframe: "1Day"; start: string; end: string; adjustment: BarsAdjustment; feed?: "delayed_sip" | "iex" }): Promise<ProviderResult<BatchPriceBars>>;
```

Use a 15-minute gateway TTL and cache key:

```ts
`bars-batch:delayed_sip:${symbols.sort().join(",")}:1Day:${start}:${end}:${adjustment}`
```

Add client method:

```ts
getBatchBars(symbols: string[], query: { start: string; end: string; adjustment: BarsAdjustment }) {
  const params = new URLSearchParams({ symbols: [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort().join(","), timeframe: "1Day", ...query });
  return this.request<BatchPriceBars>(`/api/market/bars?${params}`);
}
```

- [x] **Step 7: Verify Task 1 and commit**

Run the three focused test files, `npm run build`, and `git diff --check`. Commit:

```powershell
git add src/features/market/apiDomain.ts src/features/market/marketApiClient.ts src/features/market/marketApiClient.test.ts server/providers/alpacaProvider.ts server/providers/alpacaProvider.test.ts server/routes/marketRoutes.ts server/routes/marketRoutes.test.ts server/testing/createFixtureProviders.ts server/testing/fixtures/alpaca-batch-bars-page-1.json server/testing/fixtures/alpaca-batch-bars-page-2.json
git commit -m "feat: add batch historical bars"
```

---

### Task 2: Split Candidate Contracts and Fixtures

**Files:**
- Modify: `src/features/market/apiDomain.ts`
- Modify: `server/providers/alpacaProvider.ts`
- Modify: `server/providers/alpacaProvider.test.ts`
- Modify: `server/testing/createFixtureProviders.ts`
- Modify: `server/testing/createFixtureProviders.test.ts`
- Create: `server/testing/fixtures/alpaca-corporate-actions-splits.json`

**Interfaces:**
- Produces optional `MarketEvent.split: SplitEventDetails`.
- `quantityMultiplier` is exactly `newRate / oldRate`.

- [x] **Step 1: Write failing split-normalization tests**

Fixture:

```json
{ "corporate_actions": [
  { "id": "forward-1", "symbol": "NVDA", "type": "forward_split", "date": "2026-08-08", "old_rate": "1", "new_rate": "10" },
  { "id": "reverse-1", "symbol": "XYZ", "type": "reverse_split", "date": "2026-08-09", "old_rate": "10", "new_rate": "1" }
] }
```

```ts
test("normalizes forward and reverse split ratios", async () => {
  const result = await splitFixtureProvider().getCorporateActions(["NVDA", "XYZ"], "2026-08-01", "2026-08-10");
  expect(result.data[0]).toMatchObject({ type: "split", split: { oldRate: 1, newRate: 10, quantityMultiplier: 10, effectiveDate: "2026-08-08" } });
  expect(result.data[1]).toMatchObject({ type: "split", split: { oldRate: 10, newRate: 1, quantityMultiplier: 0.1, effectiveDate: "2026-08-09" } });
});
```

Add an invalid zero-rate case that keeps the base split event but expects `split` to be undefined.

- [x] **Step 2: Run provider tests and verify RED**

Run `npm test -- --run server/providers/alpacaProvider.test.ts`.

Expected: FAIL because split detail is absent.

- [x] **Step 3: Implement split details**

```ts
export interface SplitEventDetails { oldRate: number; newRate: number; quantityMultiplier: number; effectiveDate: string; }
```

Add `split?: SplitEventDetails` to `MarketEvent`. Extend Zod parsing with optional string/number rates. Attach details only when both parsed values are finite and positive; never discard the base event because details are invalid.

- [x] **Step 4: Add deterministic bar and split fixtures**

Add fixture batch closes for NVDA, SPY, QQQ, DIA, and IWM on `2026-08-04` through `2026-08-07`. Return an NVDA 2-for-1 split on `2026-08-06` with ID `alpaca:action:nvda-split`. Test `raw` versus `all`, split details, and `fail-next` 429.

- [x] **Step 5: Verify Task 2 and commit**

Run provider, fixture, and event-route tests plus build and diff check. Commit:

```powershell
git add src/features/market/apiDomain.ts server/providers/alpacaProvider.ts server/providers/alpacaProvider.test.ts server/testing/createFixtureProviders.ts server/testing/createFixtureProviders.test.ts server/testing/fixtures/alpaca-corporate-actions-splits.json
git commit -m "feat: normalize split events"
```

---

### Task 3: Portfolio Settings and Extended Immutable Ledger

**Files:**
- Modify: `src/features/portfolio/domain.ts`
- Create: `src/features/portfolio/portfolioSettingsRepository.ts`
- Create: `src/features/portfolio/portfolioSettingsRepository.test.ts`
- Modify: `src/features/portfolio/portfolioLedger.ts`
- Modify: `src/features/portfolio/portfolioLedger.test.ts`
- Create: `src/features/portfolio/splitDecisionRepository.ts`
- Create: `src/features/portfolio/splitDecisionRepository.test.ts`
- Modify: `src/features/portfolio/portfolioAnalytics.ts`
- Modify: `src/features/portfolio/portfolioAnalytics.test.ts`

**Interfaces:**
- Produces `PortfolioSettingsRepository.get/save/migrate/getRecoveryNotice`.
- Produces `SplitDecisionRepository.ignore/list`.
- Extends `LedgerEventType` with `deposit`, `withdrawal`, and `split`.
- `PortfolioLedger` receives `getInitialCash: () => number`, defaulting to `10_000`.

Use this settings constructor and keep `save` aligned with the approved design:

```ts
new PortfolioSettingsRepository(storage, now?: () => string, earliestEventDate?: () => string | undefined)
get(): PortfolioSettings
save(input: Omit<PortfolioSettings, "version" | "updatedAt">, now?: string): PortfolioSettings
migrate(events: LedgerEvent[], now?: string): PortfolioSettings
getRecoveryNotice(): string | undefined
```

- [x] **Step 1: Write failing settings tests**

```ts
test("migrates existing ledger settings once", () => {
  const events = [{ id: "buy-1", type: "buy", symbol: "NVDA", quantity: 1, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" }] satisfies LedgerEvent[];
  const repo = new PortfolioSettingsRepository(localStorage, () => "2026-08-10T00:00:00Z");
  expect(repo.migrate(events)).toMatchObject({ version: 1, initialCash: 10_000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD" });
  expect(repo.migrate([])).toEqual(repo.get());
});
```

Add invalid tests for negative/NaN initial cash, invalid/future inception date, inception later than earliest event, and invalid benchmark characters. Seed malformed JSON and a structurally invalid saved value; assert `get()` quarantines the bad value, returns version-1 defaults, and exposes a recoverable warning instead of crashing Portfolio.

- [x] **Step 2: Run settings tests and verify RED**

Run `npm test -- --run src/features/portfolio/portfolioSettingsRepository.test.ts`.

Expected: FAIL because the repository is missing.

- [x] **Step 3: Implement settings repository**

Use `stock_m:portfolio-settings:v1`. Validate persisted fields, normalize benchmark to uppercase, clone all returned values, and make migration idempotent. Quarantine malformed persisted data under `stock_m:portfolio-settings:corrupt:<timestamp>`, restore migration defaults, and expose one recoverable notice through `getRecoveryNotice()`. `save` calls the injected `earliestEventDate` function so it can enforce the approved inception constraint without changing its public signature.

- [x] **Step 4: Write failing cash-flow and split ledger tests**

```ts
test("records deposits and prevents an over-withdrawal", () => {
  const ledger = new PortfolioLedger(localStorage, () => 1000);
  ledger.append({ type: "deposit", amount: 500, reason: "追加资金", occurredAt: "2026-08-04T14:00:00Z" });
  ledger.append({ type: "withdrawal", amount: 1200, reason: "提取资金", occurredAt: "2026-08-05T14:00:00Z" });
  expect(() => ledger.append({ type: "withdrawal", amount: 301, reason: "过量", occurredAt: "2026-08-06T14:00:00Z" })).toThrow("可用现金");
});

test("applies and deduplicates an immutable split", () => {
  const ledger = new PortfolioLedger(localStorage, () => 10_000);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" });
  const split = { type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:action:nvda-split", confirmedAt: "2026-08-06T12:00:00Z", occurredAt: "2026-08-06T00:00:00Z" } as const;
  const first = ledger.append(split); const second = ledger.append(split);
  expect(ledger.availableQuantity("NVDA")).toBe(20);
  expect(second.id).toBe(first.id);
});
```

Add current-analytics coverage proving cash flows change cash but not P&L, while a split changes quantity and per-share cost without changing total cost.

Add ignored-split persistence coverage:

```ts
test("requires a note and stores one immutable ignored split decision", () => {
  const repo = new SplitDecisionRepository(localStorage);
  expect(() => repo.ignore({ sourceEventId: "alpaca:action:nvda-split", symbol: "NVDA", note: "", ignoredAt: "2026-08-10T10:00:00Z" })).toThrow("备注");
  repo.ignore({ sourceEventId: "alpaca:action:nvda-split", symbol: "NVDA", note: "供应商事件与持仓无关", ignoredAt: "2026-08-10T10:00:00Z" });
  expect(repo.list()).toEqual([expect.objectContaining({ sourceEventId: "alpaca:action:nvda-split" })]);
});

test("isolates corrupt ignored split decisions", () => {
  localStorage.setItem("stock_m:ignored-splits:v1", JSON.stringify([
    { sourceEventId: "alpaca:valid", symbol: "NVDA", note: "误报", ignoredAt: "2026-08-10T10:00:00Z" },
    { sourceEventId: "alpaca:bad", symbol: "NVDA", note: "", ignoredAt: "not-a-date" }
  ]));
  expect(new SplitDecisionRepository(localStorage).list()).toEqual([expect.objectContaining({ sourceEventId: "alpaca:valid" })]);
});
```

- [x] **Step 5: Run ledger/analytics tests and verify RED**

Run the ledger and analytics test files. Expected: FAIL on the new event types.

- [x] **Step 6: Implement replay invariants**

Extend ledger fields for split data. Make `availableQuantity` public. Replay cash exactly as follows:

```text
buy = -(quantity * price)
sell = +(quantity * price)
dividend = +amount
fee = -amount
deposit = +amount
withdrawal = -amount
split = 0
```

Replay split quantity as `round8(quantity * quantityMultiplier)`. In current analytics divide per-share cost by the multiplier and preserve total cost. Exclude deposits and withdrawals from cumulative P&L.

Use `stock_m:ignored-splits:v1` for ignored decisions. Validate nonempty source ID/symbol/note and ISO timestamp on read and write. Repeated `sourceEventId` returns the existing immutable decision.

- [x] **Step 7: Verify Task 3 and commit**

Run `npm test -- --run src/features/portfolio`, build, and diff check. Commit:

```powershell
git add src/features/portfolio/domain.ts src/features/portfolio/portfolioSettingsRepository.ts src/features/portfolio/portfolioSettingsRepository.test.ts src/features/portfolio/portfolioLedger.ts src/features/portfolio/portfolioLedger.test.ts src/features/portfolio/splitDecisionRepository.ts src/features/portfolio/splitDecisionRepository.test.ts src/features/portfolio/portfolioAnalytics.ts src/features/portfolio/portfolioAnalytics.test.ts
git commit -m "feat: extend portfolio cash flow ledger"
```

---

### Task 4: Performance History Loader and Derived Cache

**Files:**
- Create: `src/features/portfolio/performance/domain.ts`
- Create: `src/features/portfolio/performance/performanceHistoryLoader.ts`
- Create: `src/features/portfolio/performance/performanceHistoryLoader.test.ts`
- Create: `src/features/portfolio/performance/performanceCacheRepository.ts`
- Create: `src/features/portfolio/performance/performanceCacheRepository.test.ts`

**Interfaces:**
- Consumes `MarketApiClient.getBatchBars/getEvents`, settings, events, and ignored split IDs.
- Produces `PerformanceHistoryLoad` and content-addressed cache entries.

- [x] **Step 1: Define contracts and failing loader tests**

```ts
export interface PerformanceHistoryLoad {
  settings: PortfolioSettings;
  events: LedgerEvent[];
  holdingBars: Record<string, PriceBar[]>;
  benchmarkBars: PriceBar[];
  pendingSplits: MarketEvent[];
  notices: string[];
  sourceAsOf: { holdings?: string; benchmark?: string; events?: string };
  resourceStates: { holdings: "fresh" | "stale" | "unavailable"; benchmark: "fresh" | "stale" | "unavailable"; events: "fresh" | "stale" | "unavailable" };
  dataState: "fresh" | "stale" | "unavailable";
}
```

```ts
test("loads ever-held symbols raw, benchmark all, and split candidates", async () => {
  const client = clientFixture();
  const result = await new PerformanceHistoryLoader(client).load({ settings, events: [buyNvda, soldMsft], ignoredSplitIds: [], to: "2026-08-10" });
  expect(client.getBatchBars).toHaveBeenNthCalledWith(1, ["MSFT", "NVDA"], { start: settings.inceptionDate, end: "2026-08-10", adjustment: "raw" });
  expect(client.getBatchBars).toHaveBeenNthCalledWith(2, ["SPY"], { start: settings.inceptionDate, end: "2026-08-10", adjustment: "all" });
  expect(client.getEvents).toHaveBeenCalledWith({ from: settings.inceptionDate, to: "2026-08-10", symbols: ["MSFT", "NVDA"] });
  expect(result.pendingSplits).toEqual([expect.objectContaining({ type: "split" })]);
});
```

Add partial failures for holdings, benchmark, and events independently.

- [x] **Step 2: Run loader tests and verify RED**

Run the loader test. Expected: FAIL because the performance module is missing.

- [x] **Step 3: Implement loader with independent degradation**

Use `Promise.allSettled`. The query start is the earlier of settings inception and earliest event market date. Holdings failure yields `{}`; benchmark failure yields `[]` but still permits portfolio-only metrics; event failure yields no candidates, sets `resourceStates.events = "unavailable"`, and blocks raw-price reconstruction with “无法验证拆股事件”. Mark each resource stale when its successful envelope has `stale` or `fallback`. Filter split candidates to held intervals and exclude confirmed/ignored source IDs. Never import mock repositories.

- [x] **Step 4: Write failing cache tests**

```ts
test("invalidates cache when ledger or as-of changes", () => {
  const repo = new PerformanceCacheRepository(localStorage);
  const first = repo.key(cacheInput({ events: [buyNvda], holdingsAsOf: "10:00" }));
  const second = repo.key(cacheInput({ events: [buyNvda, deposit], holdingsAsOf: "10:00" }));
  expect(second).not.toBe(first);
});

test("isolates a corrupt cached result", () => {
  localStorage.setItem("stock_m:portfolio-performance-cache:v1", JSON.stringify([{ key: "bad", result: { points: "not-array" } }]));
  expect(new PerformanceCacheRepository(localStorage).get("bad")).toBeUndefined();
});
```

- [x] **Step 5: Implement stable cache hashing**

Canonicalize keys and events, use deterministic FNV-1a, and include ledger, settings, holdings/benchmark `asOf`, range, benchmark, and algorithm version. Retain only the 10 newest entries by `createdAt`.

- [x] **Step 6: Verify Task 4 and commit**

Run both focused tests, build, and diff check. Commit:

```powershell
git add src/features/portfolio/performance/domain.ts src/features/portfolio/performance/performanceHistoryLoader.ts src/features/portfolio/performance/performanceHistoryLoader.test.ts src/features/portfolio/performance/performanceCacheRepository.ts src/features/portfolio/performance/performanceCacheRepository.test.ts
git commit -m "feat: load portfolio performance history"
```

---

### Task 5: Daily Valuation, TWR, XIRR, Benchmark, and Drawdown

**Files:**
- Modify: `src/features/portfolio/performance/domain.ts`
- Create: `src/features/portfolio/performance/xirr.ts`
- Create: `src/features/portfolio/performance/xirr.test.ts`
- Create: `src/features/portfolio/performance/portfolioPerformanceEngine.ts`
- Create: `src/features/portfolio/performance/portfolioPerformanceEngine.test.ts`

**Interfaces:**
- Consumes `PerformanceHistoryLoad` plus selected `from/to`.
- Produces `calculatePerformance(input: PerformanceInput): PerformanceResult`.
- Exposes `solveXirr(cashFlows): number | undefined` within the performance feature.

Use this exact result shape:

```ts
interface PerformanceResult {
  points: DailyPortfolioPoint[];
  summary: PerformanceSummary;
  dailyInternals: DailyPerformanceInternal[];
  interval: { beginningValue: number; endingValue: number; deposits: number; withdrawals: number };
  warnings: string[];
}
```

- [x] **Step 1: Write failing XIRR tests**

```ts
test("solves annual money-weighted return", () => {
  expect(solveXirr([
    { at: "2025-01-01T00:00:00Z", amount: -1000 },
    { at: "2026-01-01T00:00:00Z", amount: 1100 },
  ])).toBeCloseTo(0.1, 6);
});

test("returns undefined without both cash-flow signs", () => {
  expect(solveXirr([{ at: "2026-01-01T00:00:00Z", amount: 1000 }])).toBeUndefined();
});
```

- [x] **Step 2: Run XIRR tests and verify RED**

Run `npm test -- --run src/features/portfolio/performance/xirr.test.ts`.

Expected: FAIL because `solveXirr` is missing.

- [x] **Step 3: Implement bounded XIRR**

Use actual-day year fractions (`milliseconds / 365.2425 days`). Try Newton-Raphson from `0.1`; reject rates `<= -0.999999`; stop when absolute NPV is `< 1e-8`. If Newton leaves `[-0.999999, 1000]`, use bisection over that interval. Return `undefined` after 100 total iterations or when the interval does not bracket a root.

- [x] **Step 4: Write failing performance-engine tests**

```ts
test("separates deposits from investment return", () => {
  const result = calculatePerformance(depositOnlyScenario({ initialCash: 1000, deposit: 500 }));
  expect(result.points.at(-1)?.totalValue).toBe(1500);
  expect(result.summary.twr).toBeCloseTo(0);
});

test("applies split before valuation and preserves value", () => {
  const result = calculatePerformance(nvdaSplitScenario());
  expect(result.dailyInternals.find((day) => day.marketDate === "2026-08-06")?.positions.NVDA.quantity).toBe(20);
  expect(result.points.map((point) => point.totalValue)).toEqual([1000, 1050, 1050, 1100]);
});

test("carries five missing closes and makes the sixth unavailable", () => {
  const result = calculatePerformance(missingCloseScenario(6));
  expect(result.points.slice(1, 6).every((point) => point.dataState === "stale")).toBe(true);
  expect(result.points[6]).toMatchObject({ totalValue: undefined, dataState: "unavailable", missingSymbols: ["NVDA"] });
});

test("does not link TWR across an unavailable gap", () => {
  const result = calculatePerformance(gappedScenario());
  expect(result.summary.availableFrom).toBe("2026-08-08");
  expect(result.summary.twr).toBeCloseTo(0.02);
});
```

Also cover buy, sell, dividend, fee, withdrawal, weekend flow, reverse split with 8-decimal quantity, benchmark normalization, custom range, 30-day annualization threshold, drawdown, and positive-day rate.

- [x] **Step 5: Run engine tests and verify RED**

Run `npm test -- --run src/features/portfolio/performance/portfolioPerformanceEngine.test.ts`.

Expected: FAIL because reconstruction and metrics are absent.

- [x] **Step 6: Implement deterministic daily reconstruction**

Use working positions `{ quantity, cost, realizedPnl }`. Build valuation dates from the union of valid holding and benchmark US-market dates; ledger events on non-trading days flow into the next valuation subperiod and retain their original timestamp for XIRR. For each market date:

```text
1. apply splits sorted by occurredAt
2. apply deposits and withdrawals sorted by occurredAt
3. apply buys and sells sorted by occurredAt using weighted-average cost
4. apply dividends and fees
5. resolve each held close or increment its carry count
6. value holdings and cash
7. calculate Modified Dietz and cumulative TWR
8. append benchmark, drawdown, and daily internals
```

Calculate each cash-flow weight from prior/current `valuedAt`. On a position's purchase date, use the last same-day buy price only when no close exists and mark the point stale. Thereafter carry the most recent close for no more than five valuation dates. Reset continuous TWR and peak after unavailable points. Normalize all-adjusted benchmark closes to 100 at the selected continuous segment start. Build XIRR flows from interval-opening value, deposits, withdrawals, and interval-ending value.

- [x] **Step 7: Verify Task 5 and commit**

Run XIRR and engine tests, build, and diff check. Commit:

```powershell
git add src/features/portfolio/performance/domain.ts src/features/portfolio/performance/xirr.ts src/features/portfolio/performance/xirr.test.ts src/features/portfolio/performance/portfolioPerformanceEngine.ts src/features/portfolio/performance/portfolioPerformanceEngine.test.ts
git commit -m "feat: calculate portfolio performance"
```

---

### Task 6: Exact Performance Attribution

**Files:**
- Modify: `src/features/portfolio/performance/domain.ts`
- Create: `src/features/portfolio/performance/performanceAttribution.ts`
- Create: `src/features/portfolio/performance/performanceAttribution.test.ts`

**Interfaces:**
- Consumes one continuous valid interval from `PerformanceResult.dailyInternals`.
- Produces `AttributionResult`; reads no storage or market data.

- [x] **Step 1: Write failing reconciliation tests**

```ts
test("reconciles symbols, dividends, and fees to ending assets", () => {
  const performance = calculatePerformance(attributionScenario());
  const result = calculateAttribution(performance);
  expect(result.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "symbol:NVDA", dividends: 20 }),
    expect.objectContaining({ key: "fees", moneyContribution: -5 }),
  ]));
  expect(result.totalMoneyPnl).toBeCloseTo(performance.interval.endingValue - performance.interval.beginningValue - performance.interval.deposits + performance.interval.withdrawals, 2);
  expect(result.reconciled).toBe(true);
});

test("geometrically links contribution exactly to TWR", () => {
  const performance = calculatePerformance(twoDayContributionScenario());
  const result = calculateAttribution(performance);
  expect(result.items.reduce((sum, item) => sum + (item.returnContribution ?? 0), 0)).toBeCloseTo(performance.summary.twr!, 8);
});

test("returns a diagnostic instead of rows when reconciliation fails", () => {
  expect(calculateAttribution(corruptDailyInternals())).toMatchObject({ reconciled: false, items: [], diagnostic: "RETURN_RECONCILIATION_FAILED" });
});
```

- [x] **Step 2: Run attribution tests and verify RED**

Run `npm test -- --run src/features/portfolio/performance/performanceAttribution.test.ts`.

Expected: FAIL because attribution is missing.

- [x] **Step 3: Implement money and geometrically linked contribution**

For each symbol/day:

```text
symbolPnl = endingMarketValue - beginningMarketValue - buyCashPaid + sellCashReceived
dailyContribution = symbolPnl / modifiedDietzDenominator
```

Add dividends to the matching symbol and fees to `fees`. External flows have zero contribution. Link each daily contribution with:

```text
linked_i = sum(daily_i[t] * product(1 + dailyReturn[u]) for u > t)
```

Calculate realized/unrealized changes relative to the selected interval opening baseline. Enforce all three Global Constraint tolerances before returning rows; otherwise return an empty diagnostic result.

- [x] **Step 4: Verify Task 6 and commit**

Run all performance tests, build, and diff check. Commit:

```powershell
git add src/features/portfolio/performance/domain.ts src/features/portfolio/performance/performanceAttribution.ts src/features/portfolio/performance/performanceAttribution.test.ts
git commit -m "feat: attribute portfolio performance"
```

---

### Task 7: Performance Tab, Settings, Cash Flows, and Split Review

**Files:**
- Create: `src/features/portfolio/performance/usePortfolioPerformance.ts`
- Create: `src/features/portfolio/PortfolioPerformanceTab.tsx`
- Create: `src/features/portfolio/PortfolioPerformanceTab.test.tsx`
- Create: `src/features/portfolio/PerformanceChart.tsx`
- Create: `src/features/portfolio/PerformanceSummary.tsx`
- Create: `src/features/portfolio/PerformanceAttributionTable.tsx`
- Create: `src/features/portfolio/SplitReviewPanel.tsx`
- Create: `src/features/portfolio/PortfolioSettingsDialog.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/PortfolioPage.test.tsx`
- Modify: `src/features/portfolio/portfolio.css`

**Interfaces:**
- `usePortfolioPerformance` owns loader/cache/recompute state.
- `PortfolioPerformanceTab` receives a view model and explicit callbacks.
- `PortfolioPage` owns local repositories and the injected market client.

```ts
export type PerformanceRange =
  | { kind: "inception" | "ytd" | "1y" | "6m" | "3m" }
  | { kind: "custom"; from: string; to: string };

export interface PerformanceViewModel {
  result?: PerformanceResult;
  attribution?: AttributionResult;
  pendingSplits: MarketEvent[];
  notices: string[];
  dataState: "fresh" | "stale" | "unavailable";
  provenance: { source: string; asOf?: string; availableFrom?: string };
}
```

- [x] **Step 1: Write failing performance-tab tests**

```tsx
test("switches ranges and saves a valid custom benchmark", async () => {
  const user = userEvent.setup(); const onRangeChange = vi.fn(); const onBenchmarkSave = vi.fn().mockResolvedValue(undefined);
  render(<PortfolioPerformanceTab model={readyModel()} range={{ kind: "inception" }} benchmark="SPY" onRangeChange={onRangeChange} onBenchmarkSave={onBenchmarkSave} {...actions()} />);
  await user.click(screen.getByRole("button", { name: "1 年" }));
  expect(onRangeChange).toHaveBeenCalledWith({ kind: "1y" });
  await user.selectOptions(screen.getByLabelText("比较基准"), "custom");
  await user.type(screen.getByLabelText("自定义基准代码"), "xlk");
  await user.click(screen.getByRole("button", { name: "应用基准" }));
  expect(onBenchmarkSave).toHaveBeenCalledWith("XLK");
});

test("renders gaps and unavailable metric reasons", () => {
  render(<PortfolioPerformanceTab model={unavailableModel()} {...props()} />);
  expect(screen.getByText("行情区间不连续")).toBeVisible();
  expect(screen.getByText("MWR 无法计算：现金流不足")).toBeVisible();
});

test("keeps the saved benchmark when a custom symbol has no usable history", async () => {
  const user = userEvent.setup(); const onBenchmarkSave = vi.fn().mockRejectedValue(new Error("基准没有有效历史日线"));
  render(<PortfolioPerformanceTab model={readyModel()} benchmark="SPY" onBenchmarkSave={onBenchmarkSave} {...props()} />);
  await user.selectOptions(screen.getByLabelText("比较基准"), "custom");
  await user.type(screen.getByLabelText("自定义基准代码"), "BAD");
  await user.click(screen.getByRole("button", { name: "应用基准" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("基准没有有效历史日线");
  expect(screen.getByText("SPY", { exact: true })).toBeVisible();
});

test("rejects a reversed custom date range", async () => {
  const user = userEvent.setup(); const onRangeChange = vi.fn();
  render(<PortfolioPerformanceTab model={readyModel()} range={{ kind: "inception" }} onRangeChange={onRangeChange} {...props()} />);
  await user.click(screen.getByRole("button", { name: "自定义" }));
  await user.type(screen.getByLabelText("开始日期"), "2026-08-10");
  await user.type(screen.getByLabelText("结束日期"), "2026-08-04");
  await user.click(screen.getByRole("button", { name: "应用区间" }));
  expect(screen.getByRole("alert")).toHaveTextContent("开始日期不能晚于结束日期");
  expect(onRangeChange).not.toHaveBeenCalled();
});

test("confirms an edited split ratio", async () => {
  const user = userEvent.setup(); const onConfirm = vi.fn();
  render(<SplitReviewPanel candidates={[nvdaSplitCandidate()]} onConfirm={onConfirm} onIgnore={vi.fn()} onManual={vi.fn()} />);
  await user.clear(screen.getByLabelText("新股比例")); await user.type(screen.getByLabelText("新股比例"), "4");
  await user.click(screen.getByRole("button", { name: "确认 NVDA 拆股" }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ oldRate: 1, newRate: 4, quantityMultiplier: 4 }));
});
```

Add PortfolioPage coverage for the fourth tab and deposit/withdrawal fields.

- [x] **Step 2: Run UI tests and verify RED**

Run the new tab test and PortfolioPage test. Expected: FAIL at missing UI.

- [x] **Step 3: Implement loading/cache orchestration**

```ts
type PerformanceViewState =
  | { status: "loading"; cached?: PerformanceViewModel }
  | { status: "ready"; model: PerformanceViewModel }
  | { status: "error"; cached?: PerformanceViewModel; message: string };
```

On settings, ledger revision, range, or benchmark change: compute cache key, show cache, load history, block at the first pending split, calculate performance/attribution, cache only a successful model, and ignore obsolete async results after dependency change/unmount.

- [x] **Step 4: Implement focused presentation components**

Use buttons for inception/YTD/1Y/6M/3M and date inputs for custom range. Undefined metrics render `—` plus reason. Charts use `connectNulls={false}` and separate normalized portfolio/benchmark lines. Attribution renders no ranked rows when `reconciled` is false.

- [x] **Step 5: Implement settings and split workflows**

Settings validate all repository constraints. Changing initial cash or inception with events requires a second confirmation saying “将重新计算全部历史绩效”. Split review previews quantity before/after, validates positive rates, appends immutable split on confirm, requires a note on ignore, stores ignored IDs at `stock_m:ignored-splits:v1`, and creates manual IDs as `manual:<uuid>`.

- [x] **Step 6: Extend cash-flow form and wire the fourth tab**

Add `performance` to the tab union. Deposit/withdrawal show amount and reason; split remains exclusive to SplitReviewPanel. Replace hard-coded initial cash in current analytics with migrated settings. Every successful ledger/settings change increments revision and invalidates analysis cache. Preserve overview, holdings, thesis health, alerts, and review behavior.

Replace the fixed `[10_000, 10_500, 10_200]` history with valid `PerformanceResult.points[].totalValue`. Feed the resulting real current drawdown into portfolio alert evaluation and weekly-review snapshots. While performance is loading or unavailable, omit drawdown-dependent alerts and display drawdown as unavailable rather than reverting to demo values.

- [x] **Step 7: Verify Task 7 and commit**

Run all portfolio tests, build, and diff check. Commit:

```powershell
git add src/features/portfolio/performance/usePortfolioPerformance.ts src/features/portfolio/PortfolioPerformanceTab.tsx src/features/portfolio/PortfolioPerformanceTab.test.tsx src/features/portfolio/PerformanceChart.tsx src/features/portfolio/PerformanceSummary.tsx src/features/portfolio/PerformanceAttributionTable.tsx src/features/portfolio/SplitReviewPanel.tsx src/features/portfolio/PortfolioSettingsDialog.tsx src/features/portfolio/PortfolioPage.tsx src/features/portfolio/PortfolioPage.test.tsx src/features/portfolio/portfolio.css
git commit -m "feat: add portfolio performance workspace"
```

---

### Task 8: Fixture Browser Flow, Documentation, and Completion

**Files:**
- Modify: `server/testing/createFixtureProviders.ts`
- Modify: `server/testing/e2eServer.ts`
- Create: `tests/e2e/portfolio-performance.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-10-portfolio-performance.md`

**Interfaces:**
- Adds deterministic performance fixtures only to the test server.
- Completes user documentation and verification tracking.

- [x] **Step 1: Add a failing browser flow**

```ts
test.beforeEach(async ({ page }) => { await page.goto("/"); await page.evaluate(() => localStorage.clear()); });

test("reconstructs, benchmarks, attributes, and preserves performance", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await page.getByRole("button", { name: "配置组合" }).click();
  await page.getByLabel("初始资金").fill("1000");
  await page.getByLabel("成立日期").fill("2026-08-04");
  await page.getByRole("button", { name: "保存组合设置" }).click();
  await page.getByRole("tab", { name: "持仓与交易" }).click();
  await page.getByRole("button", { name: "记录交易" }).click();
  await page.getByLabel("事件类型").selectOption("deposit");
  await page.getByLabel("金额").fill("500");
  await page.getByLabel("调整原因").fill("追加资金");
  await page.getByRole("button", { name: "确认记录" }).click();
  await page.getByRole("button", { name: "记录交易" }).click();
  await page.getByLabel("事件类型").selectOption("buy");
  await page.getByLabel("代码").fill("NVDA");
  await page.getByLabel("数量").fill("10");
  await page.getByLabel("价格").fill("100");
  await page.getByRole("button", { name: "确认记录" }).click();
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByText("SPY", { exact: true })).toBeVisible();
  await expect(page.getByText("未确认拆股会阻断生效日后的绩效")).toBeVisible();
  await page.getByRole("button", { name: "确认 NVDA 拆股" }).click();
  await expect(page.getByText("拆股已写入账本")).toBeVisible();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
  await expect(page.getByText("贡献已对账")).toBeVisible();
  await page.getByLabel("比较基准").selectOption("QQQ");
  await expect(page.getByText("QQQ", { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByText("QQQ", { exact: true })).toBeVisible();
});

test("uses stale performance bars after an Alpaca 429", async ({ page }) => {
  await seedReadyPerformance(page);
  await page.request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  await page.getByRole("button", { name: "刷新绩效" }).click();
  await expect(page.getByText("旧缓存")).toBeVisible();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
});
```

Define the second test helper in the same file so it does not depend on another test:

```ts
import type { Page } from "@playwright/test";

async function seedReadyPerformance(page: Page) {
  await page.goto("/portfolio");
  await page.evaluate(() => {
    localStorage.setItem("stock_m:portfolio-settings:v1", JSON.stringify({ version: 1, initialCash: 1000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: "2026-08-04T00:00:00Z" }));
    localStorage.setItem("stock_m:portfolio-ledger:v1", JSON.stringify([
      { id: "buy-1", type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "fixture-thesis", occurredAt: "2026-08-04T15:00:00Z" },
      { id: "split-1", type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:action:nvda-split", confirmedAt: "2026-08-06T12:00:00Z", occurredAt: "2026-08-06T00:00:00Z" }
    ]));
  });
  await page.reload();
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
}
```

- [x] **Step 2: Run E2E and verify RED**

Run `npm run test:e2e -- tests/e2e/portfolio-performance.spec.ts`.

Expected: FAIL at the missing performance tab or fixture history.

- [x] **Step 3: Complete fixture behavior and make E2E GREEN**

Ensure fixtures contain every required date/symbol and that the first successful batch request populates SQLite cache before `fail-next`. Register no `/api/testing/*` route in production `server/app.ts`. Re-run the E2E file and expect both tests to pass.

- [x] **Step 4: Update README**

Document localStorage keys; cash-flow/split semantics; raw holdings versus all-adjusted benchmark bars; Modified Dietz and XIRR signs; 5-day carry; unavailable gaps; 30-day annualization threshold; reconciliation tolerances; excluded cloud/broker/tax/background features; and the focused E2E command.

- [x] **Step 5: Run complete validation**

```powershell
npm test
npm run build
npm run test:e2e
npm run test:data:smoke
git diff --check
```

Expected: unit/integration/interaction tests, client/server TypeScript, Vite build, all stable-Chrome flows, smoke, and whitespace checks pass.

- [x] **Step 6: Run safety scans**

```powershell
$secretMatches = @(rg -n "ALPACA_API_SECRET_KEY|FINNHUB_API_KEY|FRED_API_KEY" dist 2>$null)
if ($secretMatches.Count) { $secretMatches; throw "provider secret names found in dist" }
$mockMatches = @(rg -n "mockMarketRepository|mockDiscoveryRepository" src --glob "!*.test.ts" --glob "!*.test.tsx" --glob "!mockMarketRepository.ts" --glob "!mockDiscoveryRepository.ts" 2>$null)
if ($mockMatches.Count) { $mockMatches; throw "production mock imports found" }
```

Expected: both scans produce zero matches.

- [x] **Step 7: Mark plan complete and commit**

Change completed checkboxes to `[x]`, then require zero real incomplete steps:

```powershell
$unchecked = @(rg -n -- "^- \[ \]" docs/superpowers/plans/2026-08-10-portfolio-performance.md 2>$null)
if ($unchecked.Count) { $unchecked; throw "plan still has incomplete steps" }
```

Stage only intended files:

```powershell
git add README.md server/testing/createFixtureProviders.ts server/testing/e2eServer.ts tests/e2e/portfolio-performance.spec.ts docs/superpowers/plans/2026-08-10-portfolio-performance.md
git commit -m "test: validate portfolio performance workflow"
```

---

## Completion Criteria

- Version-1 settings support configurable initial cash, inception date, USD, and default SPY.
- Ledger supports deposit, withdrawal, and confirmed split without breaking existing history.
- Fastify serves paginated 1-day bars for 1–100 symbols with validated adjustment modes.
- Reconstruction begins at inception/earliest event and never values a missing holding at zero.
- External cash flows do not become investment return.
- TWR, XIRR, annualized return, drawdown, positive-day rate, benchmark, and excess return follow the design.
- Benchmark supports SPY, QQQ, DIA, IWM, and a validated custom stock/ETF.
- Confirmed forward/reverse splits preserve value and deduplicate by source event ID.
- Unconfirmed held-period splits block affected performance.
- Contributions reconcile to TWR within `1e-8` and money P&L within `0.01 USD`.
- Stale cache keeps the performance tab usable; unavailable analytics do not block ledger, health, or review.
- Unit, integration, interaction, build, smoke, safety scan, and stable-Chrome E2E verification pass.
