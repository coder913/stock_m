# Alpaca Paper Portfolio Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display trustworthy Alpaca Paper portfolio returns, SPY comparison, drawdown, and attribution from the broker ledger and historical market data.

**Architecture:** Keep broker facts and Decimal strings at the Paper API boundary, adapt them once into the existing manual-portfolio performance domain, then reuse the existing history loader, engine, cache, chart, summary, and attribution components. Add a Paper-only controller and read-only presentation capabilities so Paper data never enters the manual ledger or settings repositories.

**Tech Stack:** TypeScript, React 19, Fastify API client, Vitest, Testing Library, Playwright, existing market API and performance engine.

## Global Constraints

- Paper performance reads only `/api/v1/portfolio/alpaca-paper/*`; it must never read or write the manual portfolio ledger.
- The API retains monetary and quantity values as Decimal strings until the adapter's final calculation boundary.
- Active broker drift makes Paper performance unavailable.
- SPY is the fixed Paper benchmark in this phase.
- Paper performance is read-only: no manual settings, manual cash flow, custom benchmark persistence, or split decisions.
- Existing manual portfolio behavior and tests must remain unchanged.
- Every production behavior change follows red-green-refactor and is committed independently.

---

### Task 1: Typed Paper Ledger API and Broker Performance Adapter

**Files:**
- Modify: `src/features/trading/paperPortfolioApiClient.ts`
- Create: `src/features/trading/paperPortfolioApiClient.test.ts`
- Modify: `src/features/portfolio/performance/brokerPerformanceAdapter.ts`
- Modify: `src/features/portfolio/performance/brokerPerformanceAdapter.test.ts`

**Interfaces:**
- Consumes: `PaperLedgerEventView` values returned by `/portfolio/alpaca-paper/ledger`.
- Produces: `PaperPortfolioApi.listLedger(): Promise<PaperLedgerEventView[]>` and `adaptBrokerPerformance(input): BrokerPerformanceAdaptation` with validated `LedgerEvent[]`, notices, and inception date.

- [x] **Step 1: Write failing API-client and adapter tests**

Add an API-client assertion for:

```ts
await api.listLedger();
expect(request).toEqual({ path: "/portfolio/alpaca-paper/ledger" });
```

Replace the adapter smoke tests with behavior tests covering:

```ts
const result = adaptBrokerPerformance({
  activeDrift: false,
  events: [
    broker({ eventType: "deposit", amount: "1000.00000000" }),
    broker({ eventType: "buy", symbol: "NVDA", quantity: "2.00000000", price: "100.12500000" }),
    broker({ eventType: "fee", amount: "-1.25000000" }),
  ],
});
expect(result.events.map((event) => event.type)).toEqual(["deposit", "buy", "fee"]);
expect(result.events[2].amount).toBe(1.25);
expect(result.inceptionDate).toBe("2026-08-04");
```

Also assert that drift returns no events, unknown events create a notice, invalid Decimal values identify the event ID, and trading events without a preceding deposit return `cashHistoryComplete: false`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx vitest run src/features/trading/paperPortfolioApiClient.test.ts src/features/portfolio/performance/brokerPerformanceAdapter.test.ts
```

Expected: FAIL because `listLedger`, the typed view, and the richer adaptation result do not exist.

- [x] **Step 3: Implement the typed API and adapter**

Define:

```ts
export interface PaperLedgerEventView {
  id: string;
  remoteSourceId: string;
  source: "alpaca-paper";
  eventType: "buy" | "sell" | "dividend" | "fee" | "deposit" | "withdrawal" | "split" | "unknown";
  symbol?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  occurredAt: string;
  provenanceJson: unknown;
}
```

Add `listLedger()` to the interface and client. Update `PostgresPaperPortfolioStore.listLedger()` if necessary so every row includes `source: "alpaca-paper"` and ISO `occurredAt`.

Implement an adapter that validates decimal strings with `/^-?\d+(?:\.\d+)?$/`, rejects non-finite conversions, normalizes signed cash activities to positive domain amounts, maps splits via `quantityMultiplier`, sorts by `occurredAt` and `id`, and returns:

```ts
interface BrokerPerformanceAdaptation {
  dataState: "fresh" | "unavailable";
  events: LedgerEvent[];
  notices: string[];
  inceptionDate?: string;
  cashHistoryComplete: boolean;
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass.

- [x] **Step 5: Commit Task 1**

Stage only the four Task 1 files plus `server/broker/paperPortfolioRepository.ts` if its response shape changed, then commit:

```text
feat: adapt paper broker ledger for performance
```

---

### Task 2: Read-Only Shared Performance Presentation

**Files:**
- Modify: `src/features/portfolio/PortfolioPerformanceTab.tsx`
- Modify: `src/features/portfolio/PortfolioPerformanceTab.test.tsx`

**Interfaces:**
- Consumes: the existing `PerformanceViewModel`, range callbacks, and a new optional `mode`.
- Produces: `mode?: "editable" | "paper-readonly"`; default `editable` preserves all manual controls.

- [ ] **Step 1: Write failing read-only presentation tests**

Render a complete performance model with `mode="paper-readonly"` and assert:

```ts
expect(screen.getByText("绩效分析")).toBeInTheDocument();
expect(screen.getByText("比较基准 SPY")).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "配置组合" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "应用基准" })).not.toBeInTheDocument();
expect(screen.queryByText("拆股确认")).not.toBeInTheDocument();
```

Keep the existing editable-mode tests unchanged to prove backward compatibility.

- [ ] **Step 2: Run the focused component test and verify RED**

Run:

```powershell
npx vitest run src/features/portfolio/PortfolioPerformanceTab.test.tsx
```

Expected: FAIL because `mode` and the read-only controls do not exist.

- [ ] **Step 3: Implement read-only capabilities**

Add `mode = "editable"`. In `paper-readonly` mode:

- Render a static `比较基准 {benchmark}` label.
- Keep range buttons, custom date range, refresh, summary, chart, cash-flow table, and attribution.
- Hide configure, benchmark-editing, and `SplitReviewPanel` controls.
- Do not call editable callbacks from hidden controls.

Make editable-only callbacks optional in the prop type and guard their use so the Paper controller has no no-op business mutations.

- [ ] **Step 4: Run the focused component test and verify GREEN**

Run the Step 2 command. Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

Commit the component and its test with:

```text
feat: add read-only performance presentation
```

---

### Task 3: Paper Performance Controller and Page Integration

**Files:**
- Create: `src/features/trading/PaperPortfolioPerformance.tsx`
- Create: `src/features/trading/PaperPortfolioPerformance.test.tsx`
- Modify: `src/features/trading/PaperPortfolioOverview.tsx`
- Modify: `src/features/trading/PaperPortfolioOverview.test.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`

**Interfaces:**
- Consumes: `PaperPortfolioApi`, `PaperPortfolioOverviewView`, `PortfolioMarketClient`, `adaptBrokerPerformance`, `usePortfolioPerformance`, and read-only `PortfolioPerformanceTab`.
- Produces: a lazily mounted Paper performance controller and three accessible Paper tabs: overview, performance, orders.

- [ ] **Step 1: Write failing controller tests**

Inject a fake Paper API and market client, then assert:

```ts
render(<PaperPortfolioPerformance api={paperApi} marketClient={marketClient} activeDrift={false} />);
expect(await screen.findByText("比较基准 SPY")).toBeInTheDocument();
expect(await screen.findByText("贡献已对账")).toBeInTheDocument();
expect(paperApi.listLedger).toHaveBeenCalledTimes(1);
```

Add separate cases for empty ledger, trading without a cash origin, request failure, and active drift. The drift case must assert that `getBatchBars` is not called and no trustworthy summary is shown.

- [ ] **Step 2: Write failing Paper tab tests**

Update `PaperPortfolioOverview.test.tsx` to assert:

```ts
expect(screen.getByRole("tab", { name: "总览" })).toHaveAttribute("aria-selected", "true");
await user.click(screen.getByRole("tab", { name: "绩效" }));
expect(await screen.findByText("比较基准 SPY")).toBeInTheDocument();
await user.click(screen.getByRole("tab", { name: "订单" }));
expect(screen.getByText("订单记录")).toBeInTheDocument();
```

- [ ] **Step 3: Run controller and page tests and verify RED**

Run:

```powershell
npx vitest run src/features/trading/PaperPortfolioPerformance.test.tsx src/features/trading/PaperPortfolioOverview.test.tsx
```

Expected: FAIL because the controller and Paper tabs do not exist.

- [ ] **Step 4: Implement the controller**

`PaperPortfolioPerformance` must:

- Load the ledger only when mounted.
- Adapt the ledger before invoking the performance hook.
- Use `{ version: 1, initialCash: 0, inceptionDate, benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt }`.
- Keep local `PerformanceRange` and ledger revision state.
- Render explicit status text before any performance hook is enabled for drift, empty ledger, incomplete cash history, or adapter failure.
- On refresh, reload the ledger first and then increment the performance revision.
- Pass `mode="paper-readonly"` to `PortfolioPerformanceTab`.

- [ ] **Step 5: Integrate accessible Paper tabs**

Refactor `PaperPortfolioOverview` into readable multi-line JSX with local `"overview" | "performance" | "orders"` state. Pass the same injected `marketClient` from `PortfolioPage` to `PaperPortfolioPerformance`. Keep Order Ticket and reconciliation on overview; mount `PaperOrderHistory` only on orders.

- [ ] **Step 6: Run controller and page tests and verify GREEN**

Run the Step 3 command. Expected: all tests pass.

- [ ] **Step 7: Run adjacent portfolio tests**

Run:

```powershell
npx vitest run src/features/portfolio/PortfolioPage.test.tsx src/features/portfolio/PortfolioPerformanceTab.test.tsx src/features/portfolio/performance
```

Expected: all manual and Paper-adjacent tests pass.

- [ ] **Step 8: Commit Task 3**

Commit the five Task 3 files with:

```text
feat: display alpaca paper portfolio performance
```

---

### Task 4: Fixture E2E, Documentation, and Completion

**Files:**
- Modify: `tests/e2e/alpaca-paper-trading.spec.ts`
- Modify: `src/features/trading/trading.css`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-11-paper-portfolio-performance.md`

**Interfaces:**
- Consumes: the complete Paper fixture lifecycle and browser-visible Paper performance page.
- Produces: browser proof that broker fills affect performance and drift blocks it.

- [ ] **Step 1: Extend the E2E test and verify RED**

After the fixture fill and reconciliation, use browser interactions to select `Alpaca Paper`, open the `绩效` tab, and assert the SPY label, performance chart, and `贡献已对账`. Inject drift and assert the specifically named drift banner using `page.getByText(/Paper 对账不一致/).first()` instead of the ambiguous global alert locator.

Run:

```powershell
npx playwright test tests/e2e/alpaca-paper-trading.spec.ts
```

Expected: FAIL before the Paper performance UI exists or before fixture cash history is complete.

- [ ] **Step 2: Complete fixture data and focused styling**

If the E2E fixture lacks a cash-origin activity, add a deterministic Paper deposit activity to the existing fixture setup. Add only layout rules needed for Paper tabs and the performance workspace; reuse current portfolio typography, tables, and charts.

- [ ] **Step 3: Run the focused E2E and verify GREEN**

Run the Step 1 command. Expected: the Paper performance lifecycle passes.

- [ ] **Step 4: Document the Paper performance boundary**

Update README to state that Paper performance is broker-ledger-backed, fixed to SPY in this phase, blocked by active drift, and separate from the manual portfolio.

- [ ] **Step 5: Run full verification**

Run each command independently and require exit code 0:

```powershell
npm test
npm run build
npm run test:e2e
```

Expected: 0 failed tests and a successful production build.

- [ ] **Step 6: Mark this plan complete and commit**

Change every completed checkbox in this plan to `[x]`, verify `git diff --check`, then commit the E2E, style, README, and plan updates with:

```text
test: complete paper performance workflow
```
