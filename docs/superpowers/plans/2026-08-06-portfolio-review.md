# stock_m Portfolio and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic paper-position table with an immutable portfolio ledger, explainable analytics, deterministic risk alerts, and versioned weekly reviews.

**Architecture:** Append all simulated portfolio activity to a versioned local ledger and derive positions through pure functions. Keep alerts and weekly reviews in separate repositories, then compose them through focused portfolio tabs so future account and price adapters can replace storage inputs without changing domain calculations.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Playwright, localStorage, feature-scoped CSS.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-08-06-portfolio-review-design.md`.
- UI copy is Simplified Chinese.
- Amounts are USD and timestamps are ISO 8601 strings.
- Missing prices remain `undefined`; never convert missing values to zero.
- Ledger events and submitted snapshots are immutable.
- Initial prices and benchmark history remain deterministic simulated data.
- No broker connection, real order, automatic rebalance, external notification, tax engine, option, margin, short sale, or custom alert-rule editor.
- Every buy references a thesis version; every sell references a thesis version or an adjustment reason.
- Desktop targets are 1440, 1280, and 1024 px.
- Forms, tabs, dialogs, tables, charts, and alert actions must be keyboard accessible.
- Use TDD and finish every task with its own commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `src/features/portfolio/domain.ts` | Ledger, position, snapshot, alert, and review types |
| `src/features/portfolio/portfolioLedger.ts` | Immutable local ledger, validation, and legacy migration |
| `src/features/portfolio/portfolioAnalytics.ts` | Pure position, P&L, exposure, concentration, and drawdown calculations |
| `src/features/portfolio/alertEngine.ts` | Pure deterministic alert-rule evaluation |
| `src/features/portfolio/alertRepository.ts` | Alert persistence and state transitions |
| `src/features/portfolio/reviewRepository.ts` | Immutable snapshots, weekly review versions, and diffs |
| `src/features/portfolio/PortfolioPage.tsx` | Portfolio route and three-tab orchestration |
| `src/features/portfolio/PortfolioOverview.tsx` | Summary cards, equity history, exposure, and risk contribution |
| `src/features/portfolio/HoldingsAndLedger.tsx` | Holdings table, ledger history, and event entry |
| `src/features/portfolio/LedgerEventDialog.tsx` | Buy, sell, dividend, and fee form |
| `src/features/portfolio/ReviewCenter.tsx` | Alert inbox, alert actions, weekly review form, and history |
| `src/features/portfolio/portfolio.css` | Responsive and accessible portfolio presentation |
| `tests/e2e/portfolio-review.spec.ts` | Trade-to-alert-to-weekly-review browser flow |

---

### Task 1: Immutable Portfolio Ledger and Legacy Migration

**Files:**
- Create: `src/features/portfolio/domain.ts`
- Create: `src/features/portfolio/portfolioLedger.ts`
- Create: `src/features/portfolio/portfolioLedger.test.ts`
- Modify: `src/features/portfolio/localPortfolioRepository.ts`
- Modify: `src/features/research/ResearchPage.tsx`

**Interfaces:**
- Produces `PortfolioLedger.list(): LedgerEvent[]`.
- Produces `PortfolioLedger.append(input: LedgerEventInput): LedgerEvent`.
- Produces `PortfolioLedger.migrateLegacyOrders(): MigrationResult`.
- Preserves `LocalPortfolioRepository.add(order)` as a compatibility adapter that appends a `buy` event.

- [ ] **Step 1: Write failing ledger and migration tests**

```ts
import { beforeEach, expect, test } from "vitest";
import { PortfolioLedger } from "./portfolioLedger";

beforeEach(() => localStorage.clear());

test("appends immutable buy, sell, dividend, and fee events", () => {
  const ledger = new PortfolioLedger(localStorage);
  const buy = ledger.append({
    type: "buy",
    symbol: "NVDA",
    occurredAt: "2026-08-03T15:00:00Z",
    quantity: 10,
    price: 100,
    thesisVersionId: "thesis-v1",
  });
  ledger.append({
    type: "sell",
    symbol: "NVDA",
    occurredAt: "2026-08-04T15:00:00Z",
    quantity: 2,
    price: 120,
    reason: "降低集中度",
  });
  ledger.append({ type: "dividend", symbol: "NVDA", occurredAt: "2026-08-05T15:00:00Z", amount: 5, reason: "现金分红" });
  ledger.append({ type: "fee", occurredAt: "2026-08-05T15:01:00Z", amount: 1, reason: "模拟费用" });

  expect(ledger.list()).toHaveLength(4);
  expect(() => Object.assign(buy, { quantity: 999 })).toThrow();
});

test("rejects a sell larger than the available quantity", () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", occurredAt: "2026-08-03T15:00:00Z", quantity: 3, price: 100, thesisVersionId: "thesis-v1" });

  expect(() => ledger.append({
    type: "sell",
    symbol: "NVDA",
    occurredAt: "2026-08-04T15:00:00Z",
    quantity: 4,
    price: 120,
    reason: "清仓",
  })).toThrow("可卖数量为 3");
});

test("migrates legacy orders exactly once", () => {
  localStorage.setItem("stock_m:orders", JSON.stringify([
    { symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "thesis-v1" },
  ]));
  const ledger = new PortfolioLedger(localStorage);

  expect(ledger.migrateLegacyOrders()).toEqual({ migrated: 1, skipped: false });
  expect(ledger.migrateLegacyOrders()).toEqual({ migrated: 0, skipped: true });
  expect(ledger.list()).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/portfolioLedger.test.ts`

Expected: FAIL because `portfolioLedger.ts` and the new domain types do not exist.

- [ ] **Step 3: Implement domain types and ledger validation**

```ts
export type LedgerEventType = "buy" | "sell" | "dividend" | "fee";

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  symbol?: string;
  occurredAt: string;
  quantity?: number;
  price?: number;
  amount?: number;
  thesisVersionId?: string;
  reason?: string;
}

export type LedgerEventInput = Omit<LedgerEvent, "id">;

export interface MigrationResult {
  migrated: number;
  skipped: boolean;
}
```

Use storage key `stock_m:portfolio-ledger:v1` and migration marker `stock_m:portfolio-ledger:migrated-orders:v1`. Validate positive quantities, prices, and amounts. Require a thesis version for buys and a thesis version or reason for sells. Compute available quantity from prior buy and sell events before accepting a sell. Freeze returned events and clone data on every read.

Update `LocalPortfolioRepository.add` to call `PortfolioLedger.append`. Keep the existing `positions(prices)` implementation unchanged in Task 1 so the intermediate commit builds without importing Task 2 files that do not exist yet. Task 2 replaces `positions(prices)` with a `calculatePortfolio` adapter after analytics is available.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/portfolioLedger.test.ts src/features/portfolio/localPortfolioRepository.test.ts src/features/research/ResearchFlow.test.tsx
npm run build
git add src/features/portfolio/domain.ts src/features/portfolio/portfolioLedger.ts src/features/portfolio/portfolioLedger.test.ts src/features/portfolio/localPortfolioRepository.ts src/features/research/ResearchPage.tsx
git commit -m "feat: add immutable portfolio ledger"
```

---

### Task 2: Portfolio Analytics

**Files:**
- Create: `src/features/portfolio/portfolioAnalytics.ts`
- Create: `src/features/portfolio/portfolioAnalytics.test.ts`
- Modify: `src/features/portfolio/domain.ts`
- Modify: `src/features/portfolio/localPortfolioRepository.ts`

**Interfaces:**
- Consumes `LedgerEvent[]`, `initialCash`, normalized quotes, sector lookup, and weekly history.
- Produces `calculatePortfolio(input: PortfolioAnalyticsInput): PortfolioAnalyticsResult`.
- Produces `calculateDrawdown(values: number[]): { current: number; maximum: number }`.

- [ ] **Step 1: Write failing analytics tests**

```ts
import { expect, test } from "vitest";
import type { LedgerEvent, PortfolioAnalyticsInput } from "./domain";
import { calculatePortfolio } from "./portfolioAnalytics";

let sequence = 0;
const event = (input: Omit<LedgerEvent, "id" | "occurredAt">): LedgerEvent => ({
  id: `event-${sequence++}`,
  occurredAt: `2026-08-0${sequence}T15:00:00Z`,
  ...input,
});
const buy = (symbol: string, quantity: number, price: number) =>
  event({ type: "buy", symbol, quantity, price, thesisVersionId: "thesis-v1" });
const sell = (symbol: string, quantity: number, price: number) =>
  event({ type: "sell", symbol, quantity, price, reason: "调整仓位" });
const dividend = (symbol: string, amount: number) =>
  event({ type: "dividend", symbol, amount, reason: "现金分红" });
const fee = (amount: number) =>
  event({ type: "fee", amount, reason: "模拟费用" });

test("calculates weighted cost, partial-sale P&L, dividends, and fees", () => {
  const result = calculatePortfolio({
    events: [
      buy("NVDA", 10, 100),
      buy("NVDA", 10, 120),
      sell("NVDA", 5, 150),
      dividend("NVDA", 20),
      fee(5),
    ],
    initialCash: 10_000,
    quotes: { NVDA: { price: 140, previousClose: 135 } },
    sectors: { NVDA: "半导体" },
    history: [10_000, 10_500, 10_200],
  });

  expect(result.positions[0]).toMatchObject({
    symbol: "NVDA",
    quantity: 15,
    averageCost: 110,
    realizedPnl: 200,
    unrealizedPnl: 450,
  });
  expect(result.cash).toBe(8_565);
  expect(result.cumulativePnl).toBe(665);
});

test("preserves a position but marks valuation unavailable when price is missing", () => {
  const result = calculatePortfolio({
    events: [buy("NVDA", 10, 100)],
    initialCash: 10_000,
    quotes: {},
    sectors: { NVDA: "半导体" },
    history: [],
  });

  expect(result.positions[0]).toMatchObject({ quantity: 10, marketValue: undefined, weight: undefined });
  expect(result.totalValue).toBeUndefined();
});

test("calculates sector exposure, top-five concentration, and drawdown boundaries", () => {
  const input: PortfolioAnalyticsInput = {
    events: [buy("NVDA", 4, 100), buy("MSFT", 6, 100)],
    initialCash: 1_000,
    quotes: {
      NVDA: { price: 100, previousClose: 100 },
      MSFT: { price: 100, previousClose: 100 },
    },
    sectors: { NVDA: "半导体", MSFT: "软件" },
    history: [100, 125, 100, 112.5],
  };
  const result = calculatePortfolio(input);
  expect(result.sectorExposure["半导体"]).toBeCloseTo(40);
  expect(result.topFiveConcentration).toBeCloseTo(100);
  expect(result.drawdown).toEqual({ current: 10, maximum: 20 });
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/portfolioAnalytics.test.ts`

Expected: FAIL because analytics functions do not exist.

- [ ] **Step 3: Implement pure calculations**

Process events chronologically. Maintain quantity, remaining cost, and realized P&L per symbol. A partial sell uses the moving weighted average cost immediately before the sell. Dividends increase cash and cumulative P&L; fees decrease both. Calculate weights and exposures only when every open position has a price. Return `undefined` for valuation-dependent totals when any price is missing.

Drawdown is a positive percentage from the running peak. The current drawdown uses the last value; maximum drawdown is the largest observed decline. Empty or single-value histories return zero.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/portfolioAnalytics.test.ts src/features/portfolio/localPortfolioRepository.test.ts
npm run build
git add src/features/portfolio/domain.ts src/features/portfolio/portfolioAnalytics.ts src/features/portfolio/portfolioAnalytics.test.ts src/features/portfolio/localPortfolioRepository.ts
git commit -m "feat: add portfolio analytics"
```

---

### Task 3: Deterministic Alerts and Alert State

**Files:**
- Create: `src/features/portfolio/alertEngine.ts`
- Create: `src/features/portfolio/alertEngine.test.ts`
- Create: `src/features/portfolio/alertRepository.ts`
- Create: `src/features/portfolio/alertRepository.test.ts`
- Modify: `src/features/portfolio/domain.ts`

**Interfaces:**
- Produces `evaluatePortfolioAlerts(input: AlertEvaluationInput): AlertCandidate[]`.
- Produces `AlertRepository.reconcile(candidates, calculatedAt): PortfolioAlert[]`.
- Produces `acknowledge(id)`, `snooze(id, until)`, `resolve(id)`, and `restoreDue(now)`.

- [ ] **Step 1: Write failing threshold and lifecycle tests**

```ts
import { beforeEach, expect, test } from "vitest";
import { evaluatePortfolioAlerts } from "./alertEngine";
import { AlertRepository } from "./alertRepository";

beforeEach(() => localStorage.clear());

const alertFixture = (overrides: { positionWeight: number }) => ({
  calculatedAt: "2026-08-06T10:00:00Z",
  naturalPeriod: "2026-W32",
  positions: [{ symbol: "NVDA", weight: overrides.positionWeight }],
  sectorExposure: {},
  drawdownPercent: 0,
  upcomingEvents: [],
  thesisStates: {},
  ledgerEvents: [],
});

const candidate = (severity: "warning" | "critical") => ({
  dedupeKey: "position-concentration:NVDA:2026-W32",
  rule: "position-concentration",
  severity,
  symbol: "NVDA",
  message: "NVDA 仓位集中",
  currentValue: severity === "critical" ? 30 : 20,
  threshold: severity === "critical" ? 30 : 20,
});

test.each([
  [19.99, undefined],
  [20, "warning"],
  [30, "critical"],
])("maps single-position weight %s to %s", (weight, severity) => {
  const alerts = evaluatePortfolioAlerts(alertFixture({ positionWeight: weight }));
  expect(alerts.find(item => item.rule === "position-concentration")?.severity).toBe(severity);
});

test("deduplicates an active alert and upgrades severity", () => {
  const repository = new AlertRepository(localStorage);
  repository.reconcile([candidate("warning")], "2026-08-06T10:00:00Z");
  repository.reconcile([candidate("critical")], "2026-08-06T11:00:00Z");

  expect(repository.list()).toHaveLength(1);
  expect(repository.list()[0].severity).toBe("critical");
});

test("snoozes and restores an alert on its due date", () => {
  const repository = new AlertRepository(localStorage);
  const [alert] = repository.reconcile([candidate("warning")], "2026-08-06T10:00:00Z");
  repository.snooze(alert.id, "2026-08-10T00:00:00Z");
  repository.restoreDue("2026-08-09T23:59:59Z");
  expect(repository.get(alert.id).status).toBe("snoozed");
  repository.restoreDue("2026-08-10T00:00:00Z");
  expect(repository.get(alert.id).status).toBe("open");
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/alertEngine.test.ts src/features/portfolio/alertRepository.test.ts`

Expected: FAIL because alert modules do not exist.

- [ ] **Step 3: Implement exact approved rules**

Evaluate:

- position weight: warning at `>= 20`, critical at `>= 30`;
- sector exposure: warning at `>= 35`, critical at `>= 45`;
- portfolio drawdown: warning at `>= 10`, critical at `>= 15`;
- earnings within seven calendar days without a current thesis review: warning;
- expired or failed thesis validation: critical;
- sell, dividend, or fee without a thesis link or reason: info.

Use `rule + symbol-or-portfolio + naturalPeriod` for `dedupeKey`. Reconciliation keeps a single active alert, upgrades severity, preserves user status unless a snooze is due, and stores the last successful calculation timestamp under `stock_m:portfolio-alerts:v1`.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/alertEngine.test.ts src/features/portfolio/alertRepository.test.ts
npm run build
git add src/features/portfolio/domain.ts src/features/portfolio/alertEngine.ts src/features/portfolio/alertEngine.test.ts src/features/portfolio/alertRepository.ts src/features/portfolio/alertRepository.test.ts
git commit -m "feat: add portfolio risk alerts"
```

---

### Task 4: Immutable Weekly Reviews and Snapshot Versions

**Files:**
- Create: `src/features/portfolio/reviewRepository.ts`
- Create: `src/features/portfolio/reviewRepository.test.ts`
- Modify: `src/features/portfolio/domain.ts`

**Interfaces:**
- Produces `ReviewRepository.submit(input: WeeklyReviewInput): WeeklyReview`.
- Produces `ReviewRepository.list(week?)`, `getSnapshot(id)`, and `diff(leftId, rightId)`.
- Stores reviews under `stock_m:portfolio-reviews:v1` and snapshots under `stock_m:portfolio-snapshots:v1`.

- [ ] **Step 1: Write failing version and immutability tests**

```ts
import { beforeEach, expect, test } from "vitest";
import type { WeeklyReviewInput } from "./domain";
import { ReviewRepository } from "./reviewRepository";

beforeEach(() => localStorage.clear());

const reviewInput = (overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput => ({
  week: "2026-W32",
  snapshot: {
    asOf: "2026-08-08T12:00:00Z",
    positions: [],
    cash: 10_000,
    totalValue: 10_000,
    cumulativePnl: 0,
    drawdownPercent: 0,
    sectorExposure: {},
  },
  events: [],
  alerts: [],
  judgment: "按计划执行",
  action: "维持仓位",
  result: "组合稳定",
  nextObservations: ["NVDA 财报"],
  ...overrides,
});

test("creates immutable weekly review versions and snapshot diffs", () => {
  const repository = new ReviewRepository(localStorage);
  const first = repository.submit(reviewInput({ action: "维持仓位" }));
  const second = repository.submit(reviewInput({
    action: "降低集中度",
    snapshot: { ...reviewInput().snapshot, totalValue: 10_500 },
  }));

  expect(first.version).toBe(1);
  expect(second.version).toBe(2);
  expect(repository.diff(first.id, second.id)).toMatchObject({
    totalValueChange: 500,
    changedFields: ["action"],
  });
  expect(() => Object.assign(repository.getSnapshot(first.snapshotId), { cash: 0 })).toThrow();
});

test("allows a no-operation review", () => {
  const repository = new ReviewRepository(localStorage);
  const review = repository.submit(reviewInput({ events: [], action: "本周无操作" }));
  expect(review.summary.tradeCount).toBe(0);
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/reviewRepository.test.ts`

Expected: FAIL because `ReviewRepository` does not exist.

- [ ] **Step 3: Implement versioned writes and explicit diffs**

The repository assigns the next version within a week, writes a deep-cloned snapshot before the review, and rolls back neither object silently if storage fails. Throw a typed `ReviewWriteError` containing the unchanged draft so the UI can retry.

`diff` compares total value, cash, position quantities, open alert count, `judgment`, `action`, `result`, and `nextObservations`. It returns numerical changes plus a stable list of changed field names.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/reviewRepository.test.ts
npm run build
git add src/features/portfolio/domain.ts src/features/portfolio/reviewRepository.ts src/features/portfolio/reviewRepository.test.ts
git commit -m "feat: add versioned weekly reviews"
```

---

### Task 5: Portfolio Overview and Ledger Interaction

**Files:**
- Create: `src/features/portfolio/PortfolioOverview.tsx`
- Create: `src/features/portfolio/HoldingsAndLedger.tsx`
- Create: `src/features/portfolio/LedgerEventDialog.tsx`
- Create: `src/features/portfolio/portfolioTestFixtures.ts`
- Create: `src/features/portfolio/PortfolioPage.test.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Create: `src/features/portfolio/portfolio.css`
- Modify: `src/features/research/ResearchPage.tsx`

**Interfaces:**
- Consumes ledger, analytics, deterministic quotes, SPY history, thesis versions, and sector lookup.
- Produces working “组合总览” and “持仓与交易” tabs.
- Produces reusable `LedgerEventDialog({ defaultSymbol?, availableQuantity?, onSubmit })`.
- Produces `createPortfolioTestDependencies(options?): PortfolioPageDependencies` for deterministic interaction tests.

- [ ] **Step 1: Write failing page interaction tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { PortfolioPage } from "./PortfolioPage";
import { createPortfolioTestDependencies } from "./portfolioTestFixtures";

test("shows explainable portfolio analytics and missing valuation", async () => {
  const dependencies = createPortfolioTestDependencies({ missingPriceSymbol: "XOM" });
  render(<MemoryRouter><PortfolioPage dependencies={dependencies} /></MemoryRouter>);
  expect(await screen.findByText("前五大持仓集中度")).toBeVisible();
  expect(screen.getByRole("table", { name: "行业暴露" })).toBeVisible();
  expect(screen.getByText("估值不可用")).toBeVisible();
});

test("rejects an oversized sell without writing the ledger", async () => {
  const user = userEvent.setup();
  const dependencies = createPortfolioTestDependencies({ nvdaQuantity: 3 });
  render(<MemoryRouter><PortfolioPage dependencies={dependencies} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "卖出 NVDA" }));
  await user.clear(screen.getByLabelText("数量"));
  await user.type(screen.getByLabelText("数量"), "4");
  await user.click(screen.getByRole("button", { name: "确认记录" }));

  expect(screen.getByRole("alert")).toHaveTextContent("可卖数量为 3");
  expect(dependencies.ledger.list()).toHaveLength(1);
});

test("records a dividend using the amount form", async () => {
  const user = userEvent.setup();
  const dependencies = createPortfolioTestDependencies();
  render(<MemoryRouter><PortfolioPage dependencies={dependencies} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "记录交易" }));
  await user.selectOptions(screen.getByLabelText("事件类型"), "dividend");
  expect(screen.getByLabelText("金额")).toBeVisible();
  expect(screen.queryByLabelText("数量")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/PortfolioPage.test.tsx`

Expected: FAIL because the page does not expose the approved tabs, analytics, or event dialog.

- [ ] **Step 3: Implement focused portfolio components**

`PortfolioPage` owns active-tab state and dependency wiring only. `PortfolioOverview` renders accessible summary cards, an equity-history table paired with the visual chart, sector exposure, concentration, and risk contribution. `HoldingsAndLedger` renders semantic holdings and event-history tables.

`LedgerEventDialog` changes fields by event type:

- buy/sell: symbol, quantity, price, occurredAt, thesis version, reason;
- dividend: symbol, amount, occurredAt, reason;
- fee: amount, occurredAt, reason.

Keep form values in state after write failure and expose `重试保存`. Show `估值不可用` for missing prices. At 1024 px, hide secondary holdings columns behind a row-details disclosure and render the event dialog as a full-height drawer.

`portfolioTestFixtures.ts` exports deterministic in-memory dependencies. `createPortfolioTestDependencies({ nvdaQuantity = 10, missingPriceSymbol })` seeds one thesis-linked NVDA buy, optionally adds an XOM holding without a quote, and returns the ledger, repositories, quote map, sector map, SPY history, and fixed clock required by `PortfolioPageDependencies`.

Update the research page’s simulated-buy action to append through `PortfolioLedger` and keep its existing thesis-first guard.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/PortfolioPage.test.tsx src/features/research/ResearchFlow.test.tsx
npm run build
git add src/features/portfolio/PortfolioOverview.tsx src/features/portfolio/HoldingsAndLedger.tsx src/features/portfolio/LedgerEventDialog.tsx src/features/portfolio/portfolioTestFixtures.ts src/features/portfolio/PortfolioPage.tsx src/features/portfolio/PortfolioPage.test.tsx src/features/portfolio/portfolio.css src/features/research/ResearchPage.tsx
git commit -m "feat: add portfolio analytics interface"
```

---

### Task 6: Alert Inbox and Weekly Review Center

**Files:**
- Create: `src/features/portfolio/ReviewCenter.tsx`
- Create: `src/features/portfolio/ReviewCenter.test.tsx`
- Modify: `src/features/portfolio/portfolioTestFixtures.ts`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/portfolio.css`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes `AlertRepository`, `ReviewRepository`, current analytics, events, and thesis summaries.
- Produces working “复盘中心” tab and `/journal` history route.
- Produces `createReviewTestDependencies(): ReviewCenterDependencies`.

- [ ] **Step 1: Write failing alert and review interactions**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { ReviewCenter } from "./ReviewCenter";
import { createReviewTestDependencies } from "./portfolioTestFixtures";

test("snoozes an alert and requires a restore date", async () => {
  const user = userEvent.setup();
  const dependencies = createReviewTestDependencies();
  render(<MemoryRouter><ReviewCenter dependencies={dependencies} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "暂缓 NVDA 仓位集中" }));
  await user.click(screen.getByRole("button", { name: "确认暂缓" }));
  expect(screen.getByRole("alert")).toHaveTextContent("请选择恢复日期");
  await user.type(screen.getByLabelText("恢复日期"), "2026-08-10");
  await user.click(screen.getByRole("button", { name: "确认暂缓" }));
  expect(screen.getByText("已暂缓至 2026-08-10")).toBeVisible();
});

test("prefills and versions a weekly review", async () => {
  const user = userEvent.setup();
  const dependencies = createReviewTestDependencies();
  render(<MemoryRouter><ReviewCenter dependencies={dependencies} /></MemoryRouter>);
  expect(screen.getByLabelText("交易摘要")).toHaveValue(expect.stringContaining("买入 NVDA"));
  await user.type(screen.getByLabelText("判断"), "集中度偏高");
  await user.type(screen.getByLabelText("行动"), "下周降低仓位");
  await user.click(screen.getByRole("button", { name: "提交周报" }));
  expect(await screen.findByText("2026-W32 · 版本 1")).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/portfolio/ReviewCenter.test.tsx`

Expected: FAIL because `ReviewCenter` does not exist.

- [ ] **Step 3: Implement alert actions, review drafts, and history**

Sort active alerts by critical, warning, then info. Filter by open, snoozed, resolved, or all. Display severity text, rule, threshold, current value, source, and calculation time. Require a date for snooze.

Prefill weekly summary from analytics, period events, and alert changes. Keep `judgment`, `action`, `result`, and `nextObservations` editable. On `ReviewWriteError`, retain all fields and render `重试保存`. Show week, version, timestamp, snapshot summary, and explicit diff from the prior version.

Extend `portfolioTestFixtures.ts` with `createReviewTestDependencies()`. Seed one open NVDA concentration alert, one NVDA buy event, fixed week `2026-W32`, fixed current analytics, and empty review history.

Replace the existing `/journal` route stub with review history using the same repository in read-only mode.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/portfolio/ReviewCenter.test.tsx src/app/AppShell.test.tsx
npm run build
git add src/features/portfolio/ReviewCenter.tsx src/features/portfolio/ReviewCenter.test.tsx src/features/portfolio/portfolioTestFixtures.ts src/features/portfolio/PortfolioPage.tsx src/features/portfolio/portfolio.css src/app/App.tsx
git commit -m "feat: add portfolio review center"
```

---

### Task 7: Browser Flow, Documentation, and Final Validation

**Files:**
- Create: `tests/e2e/portfolio-review.spec.ts`
- Modify: `tests/e2e/research-loop.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-06-portfolio-review.md`

**Interfaces:**
- Consumes all Tasks 1–6.
- Produces verified thesis-to-trade-to-alert-to-review flows using installed stable Chrome.

- [ ] **Step 1: Add the complete browser flow**

```ts
test("trades, handles a concentration alert, and submits a weekly review", async ({ page }) => {
  await page.goto("/stocks/NVDA");
  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await page.getByRole("button", { name: "确认模拟买入" }).click();
  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();

  await page.getByRole("tab", { name: "持仓与交易" }).click();
  await page.getByRole("button", { name: "买入 NVDA" }).click();
  await page.getByLabel("数量").fill("100");
  await page.getByLabel("价格").fill("167.32");
  await page.getByRole("button", { name: "确认记录" }).click();

  await page.getByRole("tab", { name: "复盘中心" }).click();
  await expect(page.getByText("NVDA 仓位集中")).toBeVisible();
  await page.getByRole("button", { name: "确认 NVDA 仓位集中" }).click();
  await page.getByLabel("判断").fill("单股权重超过计划");
  await page.getByLabel("行动").fill("下一周期降低集中度");
  await page.getByRole("button", { name: "提交周报" }).click();
  await expect(page.getByText(/版本 1/)).toBeVisible();
});
```

- [ ] **Step 2: Update documentation**

Document:

- immutable ledger and legacy migration;
- analytics definitions and missing-price behavior;
- fixed alert thresholds;
- weekly review versions;
- local storage keys;
- stable Chrome requirement;
- commands:

```bash
npm test
npm run build
npm run test:e2e
```

- [ ] **Step 3: Run complete validation**

```bash
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit and interaction tests pass, TypeScript and Vite production build succeed, all Chrome browser flows pass, and the diff has no whitespace errors.

- [ ] **Step 4: Mark this plan complete and commit**

Change every completed checkbox in this plan from `[ ]` to `[x]`, then:

```bash
git add tests/e2e/portfolio-review.spec.ts tests/e2e/research-loop.spec.ts README.md docs/superpowers/plans/2026-08-06-portfolio-review.md
git commit -m "test: validate portfolio review flow"
```

## Completion Criteria

- Existing simulated orders migrate exactly once into an immutable ledger.
- All positions, cost basis, cash, and P&L rebuild deterministically from ledger events.
- Portfolio overview explains concentration, sector exposure, equity history, and drawdown.
- Missing prices never become zero or a fabricated total value.
- Approved alert thresholds generate deduplicated, actionable alerts.
- Users can acknowledge, snooze, resolve, and revisit alerts.
- Users can submit no-operation or active weekly reviews with immutable versioned snapshots.
- Research, portfolio, alert, and review flows operate through one Chrome end-to-end path.
- Unit, interaction, build, accessibility, and browser validations pass.
