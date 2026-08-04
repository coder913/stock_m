# stock_m Research Loop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-first, mock-data MVP that completes the verified flow “today signal → stock research → investment thesis → paper portfolio.”

**Architecture:** Use a React single-page application with feature-owned domain types, components, repositories, and tests. Market data comes through a typed asynchronous repository backed by deterministic mock fixtures; thesis and paper-portfolio writes use versioned local-storage repositories so the UI contract can later survive a real API replacement.

**Tech Stack:** React, TypeScript, Vite, React Router, Vitest, Testing Library, Playwright, CSS custom properties and feature-scoped CSS.

## Global Constraints

- Product surface is a desktop Web application optimized for 1440 × 1024 and usable from 1280–1920 px.
- The selected visual target is `docs/design/stock-m-dashboard-reference.png`.
- The approved product specification is `docs/superpowers/specs/2026-08-04-stock-m-design.md`.
- The primary loop is “发现变化 → 研究证据 → 记录判断 → 模拟持仓 → 持续验证 → 复盘结果.”
- Market data must always expose its timestamp and `实时 / 延迟 N 分钟 / 收盘 / 模拟` state.
- The MVP uses deterministic mock data and must label it as delayed or simulated.
- No broker connection, live orders, options, backtesting, social ranking, or AI buy/sell recommendation.
- UI copy is Simplified Chinese.
- Default body text is 14–16 px; Chinese font is `Noto Sans SC`, numeric/Latin font is `Inter`.
- Core colors: background `#F8FAFC`, surface `#FFFFFF`, text `#101828`, secondary text `#667085`, divider `#E4E7EC`, brand `#155EEF`, positive `#039855`, negative `#D92D20`, pending `#DC6803`.
- Meet WCAG 2.2 AA contrast, keyboard navigation, visible focus, and non-color-only market-change communication.
- Use TDD for domain behavior and interaction tests; each task ends with a focused commit.

## Plan Boundary

This plan implements the first independently testable product slice:

1. Application shell and visual system.
2. “今日” dashboard with market pulse, explainable signals, weekly events, and thesis checks.
3. One stock research route using NVDA fixture data.
4. Versioned investment-thesis creation.
5. Paper-portfolio addition tied to a thesis.
6. End-to-end validation and visual comparison against the approved mockup.

Separate follow-up plans will cover:

- Discover/screener and full watchlist management.
- Production market-data ingestion and provider normalization.
- Alerts, notification delivery, journal, and post-event review.
- Full portfolio analytics, benchmarks, exposure, and attribution.
- Authentication, multi-device persistence, operations, and deployment.

## File Map

| Path | Responsibility |
| --- | --- |
| `package.json` | Scripts and runtime/test dependencies |
| `index.html` | Vite application entry document |
| `tsconfig.json` | Strict TypeScript configuration |
| `vite.config.ts` | Vite and Vitest configuration |
| `playwright.config.ts` | Browser test configuration |
| `src/main.tsx` | Browser bootstrap |
| `src/app/App.tsx` | Router and application composition |
| `src/app/AppShell.tsx` | Sidebar, top-level layout, skip link, route outlet |
| `src/app/app.css` | Global layout and reset rules |
| `src/styles/tokens.css` | Approved design tokens |
| `src/test/setup.ts` | DOM test setup |
| `src/features/market/domain.ts` | Market, signal, event, and research types |
| `src/features/market/marketRepository.ts` | Read-only market repository contract |
| `src/features/market/mockMarketRepository.ts` | Deterministic fixtures and mock repository |
| `src/components/charts/PriceSeriesChart.tsx` | Accessible shared price chart |
| `src/features/today/TodayPage.tsx` | Today-page orchestration |
| `src/features/today/MarketPulse.tsx` | SPY/QQQ/DIA/VIX strip |
| `src/features/today/SignalFeed.tsx` | Signal rows and selected signal state |
| `src/features/today/SignalDetail.tsx` | Expanded evidence/chart/action area |
| `src/features/today/WeekEvents.tsx` | Earnings/event list |
| `src/features/today/ThesisChecks.tsx` | Four-part logic validation list |
| `src/features/today/today.css` | Today-page layout and responsive rules |
| `src/features/research/ResearchPage.tsx` | Stock research route |
| `src/features/research/research.css` | Research-canvas styling |
| `src/features/thesis/domain.ts` | Thesis draft, version, and validation-condition types |
| `src/features/thesis/thesisRepository.ts` | Thesis persistence contract |
| `src/features/thesis/localThesisRepository.ts` | Versioned local-storage implementation |
| `src/features/thesis/ThesisEditor.tsx` | Four-section thesis form |
| `src/features/portfolio/domain.ts` | Paper transaction and position types |
| `src/features/portfolio/portfolioRepository.ts` | Paper-portfolio persistence contract |
| `src/features/portfolio/localPortfolioRepository.ts` | Local-storage position implementation |
| `src/features/portfolio/AddToPortfolioDialog.tsx` | Paper-position confirmation flow |
| `src/features/portfolio/PortfolioPage.tsx` | Paper holdings and totals |
| `tests/e2e/research-loop.spec.ts` | Complete user-loop browser test |

---

### Task 1: Application Shell and Visual Foundation

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/app.css`
- Create: `src/styles/tokens.css`
- Create: `src/test/setup.ts`
- Test: `src/app/AppShell.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `App(): JSX.Element` and `AppShell(): JSX.Element`; later tasks render feature routes inside the shell.

- [ ] **Step 1: Create package and tool configuration**

Create `package.json` with:

```json
{
  "name": "stock-m",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "preview": "vite preview",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "latest",
    "react-dom": "latest",
    "react-router-dom": "latest",
    "recharts": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

Create `tsconfig.json` with strict checks, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, `noEmit: true`, and includes for `src`, `tests`, and both Vite/Playwright config files.

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
```

Run:

```bash
npm install
```

Expected: dependencies install and `npm run build` reaches TypeScript compilation once source files exist.

- [ ] **Step 2: Write the failing shell test**

Create `src/app/AppShell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

test("renders the five approved primary navigation items", () => {
  render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>
  );

  for (const label of ["今日", "发现", "自选", "组合", "日志"]) {
    expect(screen.getByRole("link", { name: label })).toBeVisible();
  }
  expect(screen.getByRole("link", { name: "跳到主要内容" })).toBeVisible();
});
```

- [ ] **Step 3: Run the shell test and verify failure**

Run:

```bash
npm test -- src/app/AppShell.test.tsx
```

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 4: Implement the minimal shell**

Implement `AppShell.tsx` with:

```tsx
import { NavLink, Outlet } from "react-router-dom";

const links = [
  ["/", "今日"],
  ["/discover", "发现"],
  ["/watchlist", "自选"],
  ["/portfolio", "组合"],
  ["/journal", "日志"]
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">跳到主要内容</a>
      <aside aria-label="主导航">
        <div className="brand">stock_m<span>信号透镜</span></div>
        <nav>{links.map(([to, label]) => (
          <NavLink key={to} to={to}>{label}</NavLink>
        ))}</nav>
        <p className="data-state">模拟数据 · 延迟 15 分钟</p>
      </aside>
      <main id="main"><Outlet /></main>
    </div>
  );
}
```

Implement `App.tsx` with a browser router, `AppShell` as the parent route, and temporary semantic headings for each route. Import `tokens.css` and `app.css`.

Implement `tokens.css` using the exact global colors and typography constraints. Implement `app.css` with a 176 px sidebar at 1440 px, a visible focus ring, the skip link, and a full-width white application surface.

- [ ] **Step 5: Verify shell tests and build**

Run:

```bash
npm test -- src/app/AppShell.test.tsx
npm run build
```

Expected: PASS and successful production build.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json index.html tsconfig.json vite.config.ts src
git commit -m "feat: add stock_m application shell"
```

---

### Task 2: Typed Market Domain and Deterministic Repository

**Files:**
- Create: `src/features/market/domain.ts`
- Create: `src/features/market/marketRepository.ts`
- Create: `src/features/market/mockMarketRepository.ts`
- Test: `src/features/market/mockMarketRepository.test.ts`

**Interfaces:**
- Consumes: none.
- Produces:
  - `MarketRepository.getToday(): Promise<TodayDashboard>`
  - `MarketRepository.getInstrument(symbol: string): Promise<InstrumentResearch>`
  - `mockMarketRepository: MarketRepository`

- [ ] **Step 1: Write the repository contract and failing tests**

Define the expected contract in the test:

```ts
import { mockMarketRepository } from "./mockMarketRepository";

test("returns an explainable selected signal with freshness metadata", async () => {
  const dashboard = await mockMarketRepository.getToday();

  expect(dashboard.asOf).toBe("2026-08-04T07:30:00-04:00");
  expect(dashboard.freshness).toEqual({ kind: "delayed", minutes: 15 });
  expect(dashboard.signals[0]).toMatchObject({
    symbol: "NVDA",
    reasons: expect.arrayContaining([expect.any(String)])
  });
  expect(dashboard.signals[0].reasons).toHaveLength(3);
});

test("rejects unknown instruments", async () => {
  await expect(mockMarketRepository.getInstrument("UNKNOWN"))
    .rejects.toThrow("未找到股票 UNKNOWN");
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run:

```bash
npm test -- src/features/market/mockMarketRepository.test.ts
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement domain types**

Create `domain.ts`:

```ts
export type Freshness =
  | { kind: "realtime" }
  | { kind: "delayed"; minutes: number }
  | { kind: "close"; date: string }
  | { kind: "simulated" };

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface MarketPulse extends Quote {
  series: number[];
}

export interface Signal extends Quote {
  strength: 1 | 2 | 3 | 4 | 5;
  trigger: string;
  reasons: [string, string, string];
  relatedEvents: Array<{ date: string; label: string; source: string }>;
  series: number[];
}

export interface WeekEvent {
  date: string;
  session: "盘前" | "盘后";
  symbol: string;
  label: string;
}

export interface ThesisCheck {
  symbol: string;
  coreJudgment: string;
  evidence: string;
  risk: string;
  validation: string;
}

export interface TodayDashboard {
  asOf: string;
  freshness: Freshness;
  pulses: MarketPulse[];
  signals: Signal[];
  weekEvents: WeekEvent[];
  thesisCheck: ThesisCheck;
}

export interface InstrumentResearch {
  quote: Quote;
  asOf: string;
  freshness: Freshness;
  priceSeries: Array<{ date: string; value: number }>;
  financials: Array<{ year: string; revenue: number; eps: number }>;
  valuation: { low: number; midpoint: number; high: number; current: number };
  evidence: Array<{ date: string; category: string; text: string; source: string }>;
}
```

- [ ] **Step 4: Implement the repository**

Create `marketRepository.ts`:

```ts
import type { InstrumentResearch, TodayDashboard } from "./domain";

export interface MarketRepository {
  getToday(): Promise<TodayDashboard>;
  getInstrument(symbol: string): Promise<InstrumentResearch>;
}
```

Create deterministic NVDA/AAPL/MSFT fixtures in `mockMarketRepository.ts`. Return cloned data so UI mutation cannot alter fixtures:

```ts
const clone = <T,>(value: T): T => structuredClone(value);

export const mockMarketRepository: MarketRepository = {
  async getToday() {
    return clone(todayFixture);
  },
  async getInstrument(symbol) {
    const item = researchFixtures[symbol.toUpperCase()];
    if (!item) throw new Error(`未找到股票 ${symbol}`);
    return clone(item);
  }
};
```

- [ ] **Step 5: Verify repository tests**

Run:

```bash
npm test -- src/features/market/mockMarketRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/market
git commit -m "feat: add typed mock market repository"
```

---

### Task 3: Today Dashboard

**Files:**
- Create: `src/features/today/TodayPage.tsx`
- Create: `src/features/today/MarketPulse.tsx`
- Create: `src/features/today/SignalFeed.tsx`
- Create: `src/features/today/SignalDetail.tsx`
- Create: `src/features/today/WeekEvents.tsx`
- Create: `src/features/today/ThesisChecks.tsx`
- Create: `src/features/today/today.css`
- Create: `src/components/charts/PriceSeriesChart.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/features/today/TodayPage.test.tsx`

**Interfaces:**
- Consumes: `mockMarketRepository.getToday()` and `Signal`.
- Produces: `/` route with a selected signal and a link `/stocks/:symbol`.

- [ ] **Step 1: Write the failing Today-page interaction test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TodayPage } from "./TodayPage";

test("changes the expanded signal and keeps research action contextual", async () => {
  render(<MemoryRouter><TodayPage /></MemoryRouter>);

  expect(await screen.findByText("今天值得关注")).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("link", { name: "研究 NVDA" }))
    .toHaveAttribute("href", "/stocks/NVDA");

  await userEvent.click(screen.getByRole("button", { name: /查看 AAPL/ }));
  expect(screen.getByRole("link", { name: "研究 AAPL" }))
    .toHaveAttribute("href", "/stocks/AAPL");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/features/today/TodayPage.test.tsx
```

Expected: FAIL because `TodayPage` does not exist.

- [ ] **Step 3: Implement loading, success, and error states**

`TodayPage` owns loading and selected-symbol state:

```tsx
export function TodayPage() {
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("NVDA");

  useEffect(() => {
    mockMarketRepository.getToday().then(setData).catch(() => {
      setError("今日数据暂时不可用，请重试。");
    });
  }, []);

  if (error) return <section role="alert"><h1>今日</h1><p>{error}</p></section>;
  if (!data) return <p role="status">正在加载今日数据</p>;
  const signal = data.signals.find(item => item.symbol === selected) ?? data.signals[0];
  return (
    <>
      <MarketPulse items={data.pulses} freshness={data.freshness} />
      <div className="today-grid">
        <section>
          <h1>今天值得关注</h1>
          <SignalFeed items={data.signals} selected={signal.symbol} onSelect={setSelected} />
          <SignalDetail signal={signal} />
        </section>
        <aside className="today-rail">
          <WeekEvents events={data.weekEvents} />
          <ThesisChecks check={data.thesisCheck} />
        </aside>
      </div>
    </>
  );
}
```

Create `PriceSeriesChart.tsx` with a Recharts area chart and an equivalent text summary:

```tsx
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceSeriesChart({
  points,
  label,
  height = 260
}: {
  points: number[];
  label: string;
  height?: number;
}) {
  const data = points.map((value, index) => ({ index, value }));
  return (
    <figure aria-label={label}>
      <figcaption className="sr-only">
        {label}，起点 {points[0]?.toFixed(2)}，终点 {points.at(-1)?.toFixed(2)}
      </figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <XAxis dataKey="index" hide />
          <YAxis domain={["dataMin", "dataMax"]} width={48} />
          <Tooltip />
          <Area dataKey="value" stroke="#155EEF" fill="#EFF4FF" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
```

Use height `44` for market-pulse sparklines and the default height for selected-signal and research charts. Do not handcraft brand icons or company logos.

- [ ] **Step 4: Implement the approved layout**

Implement:

- `MarketPulse`: SPY/QQQ/DIA/VIX in one horizontal strip.
- `SignalFeed`: three rows, buttons with `aria-pressed`.
- `SignalDetail`: chart, three reasons, events, “研究 {symbol},” and “加入观察.”
- `WeekEvents`: date, session, symbol, and label.
- `ThesisChecks`: exactly four labeled rows.

Use `today.css` to match the reference:

```css
.today-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 28px;
}

.market-pulse {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--divider);
  border-radius: 8px;
}

@media (max-width: 1279px) {
  .today-grid { grid-template-columns: 1fr; }
  .today-rail { display: grid; grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 5: Verify Today-page tests and build**

Run:

```bash
npm test -- src/features/today/TodayPage.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/features/today
git commit -m "feat: build the today decision dashboard"
```

---

### Task 4: Stock Research Route

**Files:**
- Create: `src/features/research/ResearchPage.tsx`
- Create: `src/features/research/research.css`
- Modify: `src/app/App.tsx`
- Test: `src/features/research/ResearchPage.test.tsx`

**Interfaces:**
- Consumes: `mockMarketRepository.getInstrument(symbol)`.
- Produces: `/stocks/:symbol` research route; Task 5 adds thesis editing to this route.

- [ ] **Step 1: Write the failing route test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ResearchPage } from "./ResearchPage";

test("renders research evidence and freshness for the requested symbol", async () => {
  render(
    <MemoryRouter initialEntries={["/stocks/NVDA"]}>
      <Routes><Route path="/stocks/:symbol" element={<ResearchPage />} /></Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: /NVDA/ })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("heading", { name: "营收与 EPS 趋势" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "最新证据" })).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/features/research/ResearchPage.test.tsx
```

Expected: FAIL because `ResearchPage` does not exist.

- [ ] **Step 3: Implement the research canvas**

Load the symbol from `useParams`, call the repository, and render:

- Company header and freshness label.
- Long-term price section with text summary.
- Revenue/EPS table and trend visualization.
- Valuation low/mid/high/current range.
- Evidence timeline with source and date.
- Right-side thesis region with the four required headings.
- Explicit unknown-symbol state: `未找到股票 {symbol}` with a link back to Today.

The page must remain usable if the chart section fails; keep the research facts and thesis region visible.

- [ ] **Step 4: Wire the route**

Replace the temporary route in `App.tsx`:

```tsx
<Route path="stocks/:symbol" element={<ResearchPage />} />
```

- [ ] **Step 5: Verify research tests**

Run:

```bash
npm test -- src/features/research/ResearchPage.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/features/research
git commit -m "feat: add stock research workspace"
```

---

### Task 5: Versioned Investment Thesis

**Files:**
- Create: `src/features/thesis/domain.ts`
- Create: `src/features/thesis/thesisRepository.ts`
- Create: `src/features/thesis/localThesisRepository.ts`
- Create: `src/features/thesis/ThesisEditor.tsx`
- Modify: `src/features/research/ResearchPage.tsx`
- Test: `src/features/thesis/localThesisRepository.test.ts`
- Test: `src/features/thesis/ThesisEditor.test.tsx`

**Interfaces:**
- Consumes: stock symbol from `ResearchPage`.
- Produces:
  - `ThesisRepository.getLatest(symbol: string): ThesisVersion | null`
  - `ThesisRepository.save(draft: ThesisDraft): ThesisVersion`
  - `ThesisEditor({ symbol, repository, onSaved })`

- [ ] **Step 1: Define the thesis types and failing repository test**

Create `domain.ts`:

```ts
export interface ThesisDraft {
  symbol: string;
  coreJudgment: string;
  evidence: string[];
  risks: string[];
  validationConditions: Array<{
    id: string;
    text: string;
    dueDate: string;
    status: "pending" | "met" | "failed";
  }>;
}

export interface ThesisVersion extends ThesisDraft {
  id: string;
  version: number;
  createdAt: string;
}
```

Test version preservation:

```ts
test("creates a new immutable version for every save", () => {
  localStorage.clear();
  const storage = localStorage;
  const repository = new LocalThesisRepository(storage, () => "2026-08-04T12:00:00Z");
  const validDraft: ThesisDraft = {
    symbol: "NVDA",
    coreJudgment: "数据中心需求支持中期增长。",
    evidence: ["数据中心收入继续增长。"],
    risks: ["供应链受限。"],
    validationConditions: [{
      id: "condition-1",
      text: "下一财季数据中心收入继续增长。",
      dueDate: "2026-11-30",
      status: "pending"
    }]
  };

  const first = repository.save(validDraft);
  const second = repository.save({ ...validDraft, coreJudgment: "更新后的判断" });

  expect(first.version).toBe(1);
  expect(second.version).toBe(2);
  expect(repository.getHistory("NVDA")).toHaveLength(2);
  expect(repository.getHistory("NVDA")[0].coreJudgment).toBe(validDraft.coreJudgment);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/features/thesis/localThesisRepository.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement validation and versioned persistence**

`ThesisRepository` must expose:

```ts
export interface ThesisRepository {
  getLatest(symbol: string): ThesisVersion | null;
  getHistory(symbol: string): ThesisVersion[];
  save(draft: ThesisDraft): ThesisVersion;
}
```

`save` must reject:

- Empty core judgment.
- Empty evidence array.
- Empty risk array.
- No validation conditions.
- Validation condition without text or ISO date.

Store all versions under `stock_m:theses:v1`; never overwrite an earlier version.

- [ ] **Step 4: Write the failing editor test**

```tsx
test("requires all four thesis sections before saving", async () => {
  localStorage.clear();
  const repository = new LocalThesisRepository(
    localStorage,
    () => "2026-08-04T12:00:00Z"
  );
  render(<ThesisEditor symbol="NVDA" repository={repository} onSaved={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: "保存投资逻辑" }));

  expect(screen.getByText("请填写核心判断")).toBeVisible();
  expect(screen.getByText("请至少添加一条支撑证据")).toBeVisible();
  expect(screen.getByText("请至少添加一项主要风险")).toBeVisible();
  expect(screen.getByText("请至少添加一个验证条件")).toBeVisible();
});
```

- [ ] **Step 5: Implement and connect `ThesisEditor`**

Use a modal or right-side editor opened by “更新投资逻辑.” Preserve unsaved draft state if persistence throws, show `保存失败，草稿已保留`, and allow retry.

After saving, refresh the right-side thesis summary and announce success through an `aria-live="polite"` region.

- [ ] **Step 6: Verify thesis tests**

Run:

```bash
npm test -- src/features/thesis
npm test -- src/features/research/ResearchPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/thesis src/features/research/ResearchPage.tsx
git commit -m "feat: add versioned investment theses"
```

---

### Task 6: Thesis-Linked Paper Portfolio

**Files:**
- Create: `src/features/portfolio/domain.ts`
- Create: `src/features/portfolio/portfolioRepository.ts`
- Create: `src/features/portfolio/localPortfolioRepository.ts`
- Create: `src/features/portfolio/AddToPortfolioDialog.tsx`
- Create: `src/features/portfolio/PortfolioPage.tsx`
- Create: `src/features/portfolio/portfolio.css`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/features/portfolio/localPortfolioRepository.test.ts`
- Test: `src/features/portfolio/AddToPortfolioDialog.test.tsx`

**Interfaces:**
- Consumes: `ThesisRepository.getLatest(symbol)` and current research quote.
- Produces:
  - `PortfolioRepository.addTransaction(input: PaperTransactionInput): PaperTransaction`
  - `PortfolioRepository.getPositions(marketPrices: Record<string, number>): PaperPosition[]`
  - `/portfolio` holdings view.

- [ ] **Step 1: Define portfolio types and failing calculation test**

```ts
export interface PaperTransactionInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  thesisVersionId: string;
}

export interface PaperTransaction extends PaperTransactionInput {
  id: string;
  createdAt: string;
}

export interface PaperPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}
```

Test:

```ts
test("calculates weighted average cost and unrealized pnl", () => {
  localStorage.clear();
  const repository = new LocalPortfolioRepository(
    localStorage,
    () => "2026-08-04T12:00:00Z"
  );
  repository.addTransaction({
    symbol: "NVDA", side: "buy", quantity: 10, price: 100, thesisVersionId: "thesis-1"
  });
  repository.addTransaction({
    symbol: "NVDA", side: "buy", quantity: 5, price: 130, thesisVersionId: "thesis-1"
  });

  const [position] = repository.getPositions({ NVDA: 140 });
  expect(position.quantity).toBe(15);
  expect(position.averageCost).toBe(110);
  expect(position.marketValue).toBe(2100);
  expect(position.unrealizedPnl).toBe(450);
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run:

```bash
npm test -- src/features/portfolio/localPortfolioRepository.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement paper-portfolio persistence**

Store transactions under `stock_m:paper-transactions:v1`. Validate:

- Quantity and price are finite and greater than zero.
- Every transaction has a non-empty `thesisVersionId`.
- A sell cannot exceed current paper holdings.

Compute positions from immutable transactions rather than storing derived totals.

- [ ] **Step 4: Write the failing dialog test**

```tsx
test("blocks paper position creation until a thesis exists", async () => {
  localStorage.clear();
  const portfolioRepository = new LocalPortfolioRepository(
    localStorage,
    () => "2026-08-04T12:00:00Z"
  );
  render(
    <AddToPortfolioDialog
      symbol="NVDA"
      marketPrice={167.32}
      thesis={null}
      portfolioRepository={portfolioRepository}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByText("请先建立投资逻辑")).toBeVisible();
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeDisabled();
});
```

- [ ] **Step 5: Implement dialog and Portfolio page**

The confirmation dialog must display symbol, side, quantity, simulated price, total, thesis version, and the label `模拟交易，不会发送真实订单`.

On confirmation, save the transaction, close the dialog, and show `已加入模拟组合`.

`PortfolioPage` displays total simulated market value, unrealized P/L, and a holdings table with thesis-version links. Empty state links back to Today.

- [ ] **Step 6: Verify portfolio tests**

Run:

```bash
npm test -- src/features/portfolio
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.tsx src/features/portfolio src/features/research/ResearchPage.tsx
git commit -m "feat: add thesis-linked paper portfolio"
```

---

### Task 7: End-to-End Flow, Accessibility, and Visual Validation

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/research-loop.spec.ts`
- Modify: `src/app/app.css`
- Modify: `src/features/today/today.css`
- Modify: `src/features/research/research.css`
- Modify: `src/features/portfolio/portfolio.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: all routes and repositories from Tasks 1–6.
- Produces: a validated browser flow and documented local commands.

- [ ] **Step 1: Add the failing end-to-end test**

Create `playwright.config.ts` with `baseURL: "http://127.0.0.1:4173"` and a web server command `npm run build && npm run preview -- --host 127.0.0.1`.

Create:

```ts
import { expect, test } from "@playwright/test";

test("completes the research loop", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天值得关注" })).toBeVisible();

  await page.getByRole("link", { name: "研究 NVDA" }).click();
  await expect(page.getByRole("heading", { name: /NVDA/ })).toBeVisible();

  await page.getByRole("button", { name: "更新投资逻辑" }).click();
  await page.getByLabel("核心判断").fill("数据中心需求仍支持中期增长。");
  await page.getByLabel("支撑证据").fill("数据中心收入与订单保持增长。");
  await page.getByLabel("主要风险").fill("供应链与估值压缩。");
  await page.getByLabel("验证条件").fill("下一财季数据中心收入继续增长。");
  await page.getByLabel("验证日期").fill("2026-11-30");
  await page.getByRole("button", { name: "保存投资逻辑" }).click();

  await page.getByRole("button", { name: "加入模拟组合" }).click();
  await page.getByLabel("数量").fill("10");
  await page.getByRole("button", { name: "确认模拟买入" }).click();

  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();
});
```

- [ ] **Step 2: Run the end-to-end test and verify failure**

Run:

```bash
npx playwright install chromium
npm run test:e2e
```

Expected: FAIL at the first missing or mismatched interaction.

- [ ] **Step 3: Fix semantics and keyboard behavior**

Without changing the approved layout:

- Ensure every icon-only control has an accessible name.
- Ensure all dialogs trap focus and return focus to their trigger.
- Ensure all visible focus rings use at least a 2 px brand-colored outline.
- Add text or arrows alongside red/green market changes.
- Add a text summary for each chart.
- Verify skip-link and logical tab order.

- [ ] **Step 4: Match the approved visual reference**

At 1440 × 1024, capture the Today page and compare it side-by-side with `docs/design/stock-m-dashboard-reference.png`. Correct:

- Sidebar width and navigation rhythm.
- Market pulse height and four-column alignment.
- Main/rail ratio and 28 px gap.
- Signal-row height, selected-state contrast, and expanded detail hierarchy.
- Type scale, divider weight, button sizes, and red/green restraint.

Repeat the capture after fixes. Do not claim visual parity from a screenshot alone; inspect the combined reference/implementation comparison.

- [ ] **Step 5: Verify responsive desktop states**

Run manual browser checks at:

- 1440 × 1024: full sidebar and 360 px right rail.
- 1280 × 800: readable two-column layout without horizontal scroll.
- 1024 × 768: collapsed sidebar and right-side sections moved below main content.

Record failures as test assertions or targeted CSS fixes, then rerun.

- [ ] **Step 6: Document setup and product status**

Replace the one-line `README.md` with:

- Product summary and non-advice disclaimer.
- Current milestone scope.
- `npm install`, `npm run dev`, `npm test`, `npm run test:e2e`, and `npm run build`.
- Explanation that all market data is deterministic mock data.
- Links to the approved design spec and visual reference.

- [ ] **Step 7: Run the complete validation suite**

Run:

```bash
npm test
npm run build
npm run test:e2e
```

Expected: all unit/integration tests pass, production build succeeds, and the research-loop browser test passes.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests README.md src docs/design/stock-m-dashboard-reference.png
git commit -m "test: validate the stock research loop"
```

## Completion Criteria

The plan is complete only when:

- A user can open Today, understand data freshness, and select an explainable signal.
- “研究 NVDA” opens a populated research page without a second lookup.
- The user can save a four-part versioned thesis.
- A paper buy is impossible without a thesis version.
- The saved paper position appears in Portfolio with correct value and unrealized P/L.
- Unit, integration, end-to-end, build, accessibility, and visual checks pass.
- No production market API or broker behavior is implied by the UI.
