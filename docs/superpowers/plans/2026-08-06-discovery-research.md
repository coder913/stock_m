# stock_m Discovery and Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build strategy screening, saved screens, watchlist groups, market themes, event calendar, and peer comparison on top of stock_m's existing research flow.

**Architecture:** Add a typed discovery domain and repository beside the existing market repository. Execute deterministic screening in the browser for the first release, persist user-owned screens and watchlists in versioned local-storage repositories, and keep component inputs independent of provider-specific fields.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Playwright, feature-scoped CSS.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-08-06-discovery-research-design.md`.
- UI copy is Simplified Chinese.
- Initial data is deterministic mock or delayed data and always displays freshness.
- Missing metrics are not converted to zero.
- Saved screen definitions use standard metric names, not provider fields.
- No strategy backtesting, automated trading, social ranking, or AI buy/sell advice.
- Desktop targets are 1440, 1280, and 1024 px.
- All tables, condition controls, and row actions are keyboard accessible.
- Color is never the only carrier for price direction, heatmaps, or status.
- Provider failures keep the latest successful snapshot visible with source, update time, freshness, and stale state.
- Use TDD and finish every task with its own commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `src/features/discovery/domain.ts` | Conditions, templates, snapshots, events and peer types |
| `src/features/discovery/screener.ts` | Condition validation and deterministic screening |
| `src/features/discovery/templates.ts` | Four immutable system templates |
| `src/features/discovery/discoveryRepository.ts` | Discovery data read contract |
| `src/features/discovery/mockDiscoveryRepository.ts` | Deterministic stocks, themes and events |
| `src/features/discovery/savedScreenRepository.ts` | Saved-screen persistence |
| `src/features/discovery/DiscoveryPage.tsx` | Discovery tabs and orchestration |
| `src/features/discovery/ScreenerPanel.tsx` | Templates and condition editor |
| `src/features/discovery/ScreenerResults.tsx` | Results table and row actions |
| `src/features/discovery/ThemeView.tsx` | Industry and theme overview |
| `src/features/discovery/EventCalendar.tsx` | Weekly company events |
| `src/features/watchlist/watchlistRepository.ts` | Watchlist group persistence |
| `src/features/watchlist/WatchlistPage.tsx` | Groups and membership UI |
| `src/features/research/PeerComparison.tsx` | Comparable-company metrics |
| `tests/e2e/discovery-flow.spec.ts` | Complete discovery-to-research flow |

---

### Task 1: Screening Domain, Templates, and Engine

**Files:**
- Create: `src/features/discovery/domain.ts`
- Create: `src/features/discovery/templates.ts`
- Create: `src/features/discovery/screener.ts`
- Test: `src/features/discovery/screener.test.ts`

**Interfaces:**
- Produces `runScreen(stocks: StockSnapshot[], conditions: ScreenerCondition[]): StockSnapshot[]`.
- Produces condition validation with field-level invalid-value and conflict errors.
- Produces provider-independent metric metadata for period and unit normalization.
- Produces immutable `systemTemplates: readonly ScreenerTemplate[]`.

- [x] **Step 1: Write failing screening tests**

```ts
import { expect, test } from "vitest";
import { runScreen } from "./screener";
import { systemTemplates } from "./templates";

test("combines conditions and excludes missing metrics", () => {
  const result = runScreen(fixtures, [
    { id: "growth", metric: "revenueGrowthYoY", operator: ">=", value: 20, period: "TTM" },
    { id: "price", metric: "price", operator: ">=", value: 5, period: "CURRENT" }
  ]);
  expect(result.map(item => item.symbol)).toEqual(["NVDA"]);
});

test("supports inclusive between boundaries", () => {
  const result = runScreen(fixtures, [
    { id: "pe", metric: "forwardPE", operator: "between", value: [20, 30], period: "FY1" }
  ]);
  expect(result.map(item => item.symbol)).toEqual(["AAPL", "MSFT"]);
});

test("system templates cannot be mutated", () => {
  expect(Object.isFrozen(systemTemplates[0].conditions)).toBe(true);
});

test.each([">", ">=", "<", "<=", "=", "between"] as const)(
  "evaluates the %s operator",
  operator => {
    expect(runScreen(fixtures, [conditionFor(operator)])).toEqual(expectedFor(operator));
  }
);

test("reports conflicting conditions on the same metric", () => {
  expect(validateConditions(conflictingConditions)).toEqual([
    expect.objectContaining({ conditionId: "price-min", code: "conflict" })
  ]);
});
```

- [x] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/discovery/screener.test.ts`

Expected: FAIL because discovery modules do not exist.

- [x] **Step 3: Implement types and engine**

```ts
export type ScreenerOperator = ">" | ">=" | "<" | "<=" | "=" | "between";
export type ScreenerPeriod = "CURRENT" | "MRQ" | "TTM" | "FY1";

export interface ScreenerCondition {
  id: string;
  metric: keyof StockMetrics;
  operator: ScreenerOperator;
  value: number | [number, number];
  period: ScreenerPeriod;
}

export interface StockSnapshot {
  symbol: string;
  name: string;
  industry: string;
  metrics: Partial<StockMetrics>;
  nextEvent?: CompanyEvent;
}
```

`runScreen` must return false for missing or non-finite metric values. `between` includes both bounds. Invalid numeric input blocks execution and identifies its condition; conflicting bounds identify the shared metric. Define the exact four approved templates from the specification, freeze each system template and its condition array, and copy template conditions before editing.

- [x] **Step 4: Verify and commit**

```bash
npm test -- src/features/discovery/screener.test.ts
npm run build
git add src/features/discovery/domain.ts src/features/discovery/templates.ts src/features/discovery/screener.ts src/features/discovery/screener.test.ts
git commit -m "feat: add discovery screening engine"
```

---

### Task 2: Discovery and Saved-Screen Repositories

**Files:**
- Create: `src/features/discovery/discoveryRepository.ts`
- Create: `src/features/discovery/mockDiscoveryRepository.ts`
- Create: `src/features/discovery/savedScreenRepository.ts`
- Test: `src/features/discovery/savedScreenRepository.test.ts`
- Test: `src/features/discovery/mockDiscoveryRepository.test.ts`

**Interfaces:**
- Produces `DiscoveryRepository.listStocks()`, `listThemes()`, `listEvents()`, and `getPeers(symbol)` using a shared source/freshness/update-time envelope.
- Produces `SavedScreenRepository.list()`, `save(input)`, `rename(id, name)`, `duplicate(id)`, and `remove(id)`.

- [x] **Step 1: Write failing repository tests**

```ts
test("saves independent screen definitions", () => {
  const repository = new SavedScreenRepository(localStorage);
  const saved = repository.save({ name: "成长", conditions, sort });
  const copy = repository.duplicate(saved.id);
  repository.rename(copy.id, "成长副本");
  expect(repository.list().map(item => item.name)).toEqual(["成长", "成长副本"]);
});

test("returns source and freshness with discovery data", async () => {
  const result = await mockDiscoveryRepository.listStocks();
  expect(result.freshness).toEqual({ kind: "delayed", minutes: 15 });
  expect(result.source).toBe("stock_m demo dataset");
});
```

- [x] **Step 2: Run tests and verify expected failure**

Run: `npm test -- src/features/discovery/*Repository.test.ts`

Expected: FAIL because repositories do not exist.

- [x] **Step 3: Implement repositories**

Store screens under `stock_m:saved-screens:v1`. Generate IDs with `crypto.randomUUID()`. Copy condition arrays on every read and write. `remove` deletes only the requested ID.

The mock discovery repository returns at least NVDA, AAPL, MSFT, AMZN, AMD, LLY, and XOM, with complete documented metrics where available and intentional missing values for missing-data tests. Saved screens persist definitions and sorting only, never result rows. Repository errors are typed so the UI can retain an unsaved draft and retry.

- [x] **Step 4: Verify and commit**

```bash
npm test -- src/features/discovery
npm run build
git add src/features/discovery
git commit -m "feat: add discovery repositories"
```

---

### Task 3: Strategy Screener UI

**Files:**
- Create: `src/features/discovery/DiscoveryPage.tsx`
- Create: `src/features/discovery/ScreenerPanel.tsx`
- Create: `src/features/discovery/ScreenerResults.tsx`
- Create: `src/features/discovery/discovery.css`
- Modify: `src/app/App.tsx`
- Test: `src/features/discovery/DiscoveryPage.test.tsx`

**Interfaces:**
- Consumes system templates, `runScreen`, repositories, and `onAddToWatchlist(symbol)`.
- Produces functional `/discover` route.

- [x] **Step 1: Write failing interaction test**

```tsx
test("selecting a template updates conditions and matching results", async () => {
  render(<MemoryRouter><DiscoveryPage /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "高质量成长" }));
  expect(screen.getByText("营收同比增长")).toBeVisible();
  expect(screen.getByRole("row", { name: /NVDA/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /XOM/ })).not.toBeInTheDocument();
});

test("keeps a draft and offers retry when saving fails", async () => {
  render(<MemoryRouter><DiscoveryPage savedScreens={failingRepository} /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText("筛选名称"), "成长候选");
  await userEvent.click(screen.getByRole("button", { name: "保存筛选" }));
  expect(screen.getByLabelText("筛选名称")).toHaveValue("成长候选");
  expect(screen.getByRole("button", { name: "重试保存" })).toBeVisible();
});
```

- [x] **Step 2: Run test and verify expected failure**

Run: `npm test -- src/features/discovery/DiscoveryPage.test.tsx`

Expected: FAIL because `DiscoveryPage` does not exist.

- [x] **Step 3: Implement page**

Render four tab buttons, four template buttons, accessible condition rows, result count, sorting, pagination, and a semantic results table with the approved default columns. Changes recalculate immediately. Render `研究 {symbol}` links and `加入自选 {symbol}` buttons. Display `数据缺失` for undefined metrics and source, update time, and `延迟 15 分钟` above results. Empty results explain which conditions can be relaxed.

The “已保存筛选” tab runs, duplicates, renames, and removes saved screens. Saving a modified system template creates a user screen without mutating the template. At 1280 px hide nonessential columns; at 1024 px move the condition editor into a keyboard-accessible drawer.

- [x] **Step 4: Verify and commit**

```bash
npm test -- src/features/discovery/DiscoveryPage.test.tsx
npm run build
git add src/features/discovery src/app/App.tsx
git commit -m "feat: add strategy screener interface"
```

---

### Task 4: Watchlist Groups

**Files:**
- Create: `src/features/watchlist/watchlistRepository.ts`
- Create: `src/features/watchlist/WatchlistPage.tsx`
- Create: `src/features/watchlist/watchlist.css`
- Modify: `src/features/discovery/DiscoveryPage.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/features/watchlist/watchlistRepository.test.ts`
- Test: `src/features/watchlist/WatchlistPage.test.tsx`

**Interfaces:**
- Produces `createGroup`, `renameGroup`, `moveGroup`, `removeGroup`, `restoreGroup`, `addSymbol`, and `removeSymbol`.
- Consumes discovery result row actions.

- [x] **Step 1: Write failing soft-delete test**

```ts
test("removing and restoring a group preserves memberships", () => {
  const repository = new WatchlistRepository(localStorage);
  const group = repository.createGroup("AI 基础设施");
  repository.addSymbol(group.id, "NVDA");
  repository.removeGroup(group.id);
  expect(repository.list()).toEqual([]);
  repository.restoreGroup(group.id);
  expect(repository.list()[0].symbols).toEqual(["NVDA"]);
});
```

- [x] **Step 2: Run test and verify expected failure**

Run: `npm test -- src/features/watchlist`

Expected: FAIL because watchlist modules do not exist.

- [x] **Step 3: Implement persistence and UI**

Use storage key `stock_m:watchlists:v1`. A stock may belong to multiple groups. Render group creation, rename, ordering, soft delete, restore, and rows with price, valuation state, next event, and thesis state. Deleting a group must not modify research, thesis, or paper-portfolio repositories.

- [x] **Step 4: Verify and commit**

```bash
npm test -- src/features/watchlist
npm run build
git add src/features/watchlist src/features/discovery/DiscoveryPage.tsx src/app/App.tsx
git commit -m "feat: add grouped watchlists"
```

---

### Task 5: Themes, Calendar, and Peer Comparison

**Files:**
- Create: `src/features/discovery/ThemeView.tsx`
- Create: `src/features/discovery/EventCalendar.tsx`
- Create: `src/features/research/PeerComparison.tsx`
- Modify: `src/features/discovery/DiscoveryPage.tsx`
- Modify: `src/features/research/ResearchPage.tsx`
- Test: `src/features/research/PeerComparison.test.tsx`

**Interfaces:**
- Consumes repository themes, events, and peers.
- Produces comparable-company table and discovery tab content.

- [x] **Step 1: Write failing period-mismatch test**

```tsx
test("blocks direct comparison when financial periods differ", () => {
  render(<PeerComparison peers={mismatchedPeers} />);
  expect(screen.getByRole("alert")).toHaveTextContent("财务周期不一致");
  expect(screen.queryByLabelText("同业指标图")).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run test and verify expected failure**

Run: `npm test -- src/features/research/PeerComparison.test.tsx`

Expected: FAIL because `PeerComparison` does not exist.

- [x] **Step 3: Implement views**

Theme rows provide industry and theme views; area represents market-cap weight, while direction symbol, percentage, and valuation deviation accompany color. Calendar supports week and list views, prioritizes watchlist and paper-portfolio symbols, and marks dates `预计` or `已确认`. Peer comparison defaults to no more than five same-industry, similar-market-cap companies, allows users to add or remove peers, and shows metric unit, period, source, and missing-data labels.

- [x] **Step 4: Verify and commit**

```bash
npm test -- src/features/research/PeerComparison.test.tsx
npm run build
git add src/features/discovery src/features/research
git commit -m "feat: add themes events and peer comparison"
```

---

### Task 6: End-to-End Validation and Documentation

**Files:**
- Create: `tests/e2e/discovery-flow.spec.ts`
- Modify: `README.md`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes all Tasks 1–5.
- Produces verified discovery-to-research user flow.

- [x] **Step 1: Add browser flow**

```ts
test("discovers NVDA and adds it to a watchlist", async ({ page }) => {
  await page.goto("/discover");
  await page.getByRole("button", { name: "高质量成长" }).click();
  await page.getByLabel("营收同比增长下限").fill("18");
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();
  await page.getByRole("button", { name: "加入自选 NVDA" }).click();
  await page.getByLabel("自选分组").selectOption({ label: "AI 基础设施" });
  await page.getByRole("button", { name: "确认加入" }).click();
  await page.getByRole("link", { name: "研究 NVDA" }).click();
  await expect(page.getByRole("heading", { name: /NVDA/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同业比较" })).toBeVisible();
});

test("opens a prioritized watchlist event from the calendar", async ({ page }) => {
  await page.goto("/discover?tab=calendar");
  await page.getByRole("link", { name: /NVDA 财报/ }).click();
  await expect(page).toHaveURL(/\/research\/NVDA/);
});
```

- [x] **Step 2: Update documentation**

Document the four templates, saved-screen storage, grouped watchlists, delayed demo data, and commands:

```bash
npm test
npm run build
npm run test:e2e
```

- [x] **Step 3: Run complete validation**

```bash
npm test
npm run build
npm run test:e2e
```

Expected: unit and interaction suites pass, production build succeeds, and both Playwright flows pass.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/discovery-flow.spec.ts README.md vite.config.ts
git commit -m "test: validate discovery research flow"
```

## Completion Criteria

- Four immutable templates execute with explainable conditions.
- Users can edit and save screens.
- Results can be added to grouped watchlists.
- Theme and event views expose freshness and status.
- Research pages show peer comparison with period protection.
- Unit, interaction, build, accessibility, and browser-flow checks pass.
