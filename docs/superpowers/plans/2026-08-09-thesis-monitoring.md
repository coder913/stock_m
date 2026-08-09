# Thesis Monitoring Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, browser-local thesis monitoring loop that evaluates structured metric and event conditions, records explainable state transitions, creates deduplicated in-app alerts, and lets the user review them across Research, Today, Portfolio, and `/monitor`.

**Architecture:** The browser owns condition definitions, evaluations, alerts, and review decisions in versioned localStorage repositories. A pure evaluator consumes normalized `MonitorSnapshot` values loaded through the existing `MarketApiClient`; `ThesisMonitorService` orchestrates evaluation and alert creation. Fastify remains a market-data gateway and gains only deterministic E2E fixture mutation, never thesis persistence or background scheduling.

**Tech Stack:** React, TypeScript, React Router, Fastify fixture server, localStorage repositories, Vitest, Testing Library, Playwright, stable Chrome.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-08-09-thesis-monitoring-design.md`.
- Use TDD for every production behavior: write the focused test, verify the expected failure, implement minimally, and verify green.
- Keep all thesis definitions, evaluations, alerts, and reviews browser-local; do not add server persistence or scheduled jobs.
- Only fresh and complete data may change a decisive condition status.
- Missing, unavailable, or stale data must preserve the last fresh decisive status and must not produce a breach or recovery alert.
- The system evaluates individual conditions; only the user may mark an entire thesis `reaffirmed`, `invalidated`, or `archived`.
- Structured conditions bind to an immutable thesis `id`; modifying a thesis creates a new thesis version and new condition versions.
- Preserve legacy string `validationConditions` as visible, unstructured history; never auto-convert it.
- Dates persist as ISO 8601. Event decisions compare the ISO market-date portion; UI renders local time.
- Do not add AI parsing, news keyword monitoring, email, browser notifications, real orders, or portfolio mutations.
- Preserve the user-owned `readme_work.md` changes and untracked `chrome/` directory.
- Finish each task with its focused tests, `npm run build`, `git diff --check`, and its own commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `src/features/monitoring/domain.ts` | Conditions, evaluations, alerts, reviews, health summaries, and snapshot types |
| `src/features/monitoring/conditionVersion.ts` | Canonical serialization and stable condition-version hash |
| `src/features/monitoring/conditionEvaluator.ts` | Pure metric/event evaluation and data-quality rules |
| `src/features/monitoring/conditionRepository.ts` | Versioned condition persistence and soft deletion |
| `src/features/monitoring/evaluationRepository.ts` | Evaluation history and latest fresh decisive lookup |
| `src/features/monitoring/monitorAlertRepository.ts` | Deduplicated alert inbox, snooze, read, and archive operations |
| `src/features/monitoring/thesisReviewRepository.ts` | User-owned thesis decisions with immutable snapshots |
| `src/features/monitoring/monitorSnapshotLoader.ts` | Batched API-to-monitor-snapshot adapter |
| `src/features/monitoring/thesisMonitorService.ts` | Evaluation, transition, alert, and health-summary orchestration |
| `src/features/monitoring/ConditionEditor.tsx` | Structured metric/event condition form |
| `src/features/monitoring/ResearchMonitorPanel.tsx` | Research-page thesis save, condition status, refresh, and review UI |
| `src/features/monitoring/ReviewQueue.tsx` | Today review-needed alert list |
| `src/features/monitoring/PortfolioHealth.tsx` | Portfolio-wide and per-position health summaries |
| `src/features/monitoring/MonitorPage.tsx` | `/monitor` inbox, filters, timeline, and review decisions |
| `server/testing/createFixtureProviders.ts` | Mutable deterministic quote state for monitoring E2E only |
| `server/testing/e2eServer.ts` | Test-only market-state mutation endpoint |
| `tests/e2e/thesis-monitoring.spec.ts` | Full condition-to-alert-to-review browser flow |

---

### Task 1: Monitoring Domain, Stable Versions, and Pure Evaluator

**Files:**
- Create: `src/features/monitoring/domain.ts`
- Create: `src/features/monitoring/conditionVersion.ts`
- Create: `src/features/monitoring/conditionVersion.test.ts`
- Create: `src/features/monitoring/conditionEvaluator.ts`
- Create: `src/features/monitoring/conditionEvaluator.test.ts`

**Interfaces:**
- Produces `ThesisCondition`, `ConditionDraft`, `ConditionEvaluation`, `MonitorSnapshot`, `MonitorAlert`, `ThesisReview`, and `ThesisHealthSummary`.
- Produces `conditionVersion(condition): string`.
- Produces `evaluateCondition({ condition, snapshot, previousDecisive, now }): ConditionEvaluation`.
- Later tasks must import these types instead of creating page-specific copies.

- [x] **Step 1: Write failing stable-version and metric-rule tests**

```ts
// src/features/monitoring/conditionVersion.test.ts
import { expect, test } from "vitest";
import { conditionVersion } from "./conditionVersion";

test("produces the same version for semantically identical condition objects", () => {
  const left = { kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" } as const;
  const right = { period: "CURRENT", target: 180, operator: ">=", metric: "price", severity: "high", direction: "risk", name: "估值风险", kind: "metric" } as const;
  expect(conditionVersion(left)).toBe(conditionVersion(right));
});
```

```ts
// src/features/monitoring/conditionEvaluator.test.ts
import { expect, test } from "vitest";
import { evaluateCondition } from "./conditionEvaluator";

test("marks a matching risk metric as breached with an explanation", () => {
  const evaluation = evaluateCondition({
    condition: metricCondition({ direction: "risk", metric: "price", operator: ">=", target: 180 }),
    snapshot: metricSnapshot("NVDA", "price", 190, "2026-08-09T14:00:00Z"),
    now: "2026-08-09T14:01:00Z",
  });
  expect(evaluation).toMatchObject({ status: "breached", dataState: "fresh", actualValue: 190, targetValue: 180, source: "alpaca" });
  expect(evaluation.explanation).toContain("190 >= 180");
});

test("keeps the last decisive status when current data is stale", () => {
  const previous = evaluation({ status: "confirmed", dataState: "fresh", asOf: "2026-08-08T14:00:00Z" });
  const result = evaluateCondition({
    condition: metricCondition({ direction: "risk", metric: "price", operator: ">=", target: 180 }),
    snapshot: metricSnapshot("NVDA", "price", 190, "2026-08-09T14:00:00Z", true),
    previousDecisive: previous,
    now: "2026-08-09T14:01:00Z",
  });
  expect(result).toMatchObject({ status: "confirmed", dataState: "stale", changed: false });
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```powershell
npm test -- src/features/monitoring/conditionVersion.test.ts src/features/monitoring/conditionEvaluator.test.ts
```

Expected: FAIL because the monitoring domain, version function, and evaluator do not exist.

- [x] **Step 3: Implement the exact domain contracts**

```ts
export type MonitorMetric = "price" | "dailyChangePercent" | "revenueGrowthYoY" | "operatingMargin" | "freeCashFlow" | "freeCashFlowYield" | "netDebtToEbitda" | "earningsSurprise" | "grossMarginYoYChange" | "priceVs20DayHigh" | "relativeVolume" | "averageDollarVolume20d";
export type ConditionStatus = "pending" | "confirmed" | "breached" | "expired";
export type EvaluationDataState = "fresh" | "missing" | "stale" | "unavailable";

export interface MetricValue {
  value?: number;
  source?: "alpaca" | "sec" | "finnhub" | "fred" | "composite";
  asOf?: string;
  dataState: EvaluationDataState;
  notices: string[];
}

export interface MonitorSnapshot {
  symbol: string;
  metrics: Partial<Record<MonitorMetric, MetricValue>>;
  events: import("../market/apiDomain").MarketEvent[];
  eventsState: EvaluationDataState;
  eventsAsOf?: string;
  generatedAt: string;
}
```

Define the remaining contracts exactly as approved in the spec. Add `changed: boolean` and `previousStatus?: ConditionStatus` to `ConditionEvaluation`; these are computed fields used by `ThesisMonitorService`, not persisted user decisions.

- [x] **Step 4: Implement canonical hashing and metric/event evaluation**

`conditionVersion` must recursively sort object keys, preserve array order, exclude generated fields (`id`, `conditionVersion`, `createdAt`, `updatedAt`, `deletedAt`, `symbol`, `thesisVersionId`), and return a lowercase eight-character FNV-1a hex hash.

`evaluateCondition` must implement:

```ts
if (dataState !== "fresh") {
  if (previousDecisive) return retain(previousDecisive, dataState, false);
  if (condition.deadline && now.slice(0, 10) > condition.deadline) return expired(dataState);
  return pending(dataState);
}
const matched = compare(actual, condition.operator, condition.target);
const status = condition.direction === "support"
  ? matched ? "confirmed" : "breached"
  : matched ? "breached" : "confirmed";
```

Event evaluation must keep `before-date` and `within-range` pending until their window closes, and keep `not-occurred-by-date` pending until `to`. Macro events ignore symbol; company events require an exact normalized symbol match.

- [x] **Step 5: Add boundary and event tests, then verify GREEN**

Add table cases for all five operators, inclusive `between`, reversed bounds rejection, support/risk direction, expired-without-data, each event occurrence mode, and market-date comparison.

Run:

```powershell
npm test -- src/features/monitoring/conditionVersion.test.ts src/features/monitoring/conditionEvaluator.test.ts
npm run build
git diff --check
```

- [x] **Step 6: Commit Task 1**

```powershell
git add src/features/monitoring/domain.ts src/features/monitoring/conditionVersion.ts src/features/monitoring/conditionVersion.test.ts src/features/monitoring/conditionEvaluator.ts src/features/monitoring/conditionEvaluator.test.ts
git commit -m "feat: add thesis condition evaluator"
```

---

### Task 2: Versioned Local Repositories and Thesis Binding

**Files:**
- Create: `src/features/monitoring/conditionRepository.ts`
- Create: `src/features/monitoring/conditionRepository.test.ts`
- Create: `src/features/monitoring/evaluationRepository.ts`
- Create: `src/features/monitoring/evaluationRepository.test.ts`
- Create: `src/features/monitoring/monitorAlertRepository.ts`
- Create: `src/features/monitoring/monitorAlertRepository.test.ts`
- Create: `src/features/monitoring/thesisReviewRepository.ts`
- Create: `src/features/monitoring/thesisReviewRepository.test.ts`
- Modify: `src/features/thesis/localThesisRepository.ts`
- Modify: `src/features/thesis/localThesisRepository.test.ts`

**Interfaces:**
- `ConditionRepository.saveForThesis(input): ThesisCondition[]`, `listForThesis(thesisVersionId)`, `listActive(symbols?)`, and `softDelete(id, deletedAt)`.
- `EvaluationRepository.append(evaluation): { evaluation; inserted }`, `latest(conditionId)`, `latestDecisive(conditionId)`, and `list(conditionId)`.
- `MonitorAlertRepository.createTransition(input)`, `list(query)`, `markRead`, `snooze`, `archive`, and `restoreDue`.
- `ThesisReviewRepository.record(input)`, `latest(thesisVersionId)`, and `list(thesisVersionId)`.
- `LocalThesisRepository.getLatest(symbol)` and immutable `createdAt` on saved theses.

- [x] **Step 1: Write failing repository tests**

```ts
test("binds normalized conditions to one immutable thesis version", () => {
  const repo = new ConditionRepository(localStorage);
  const saved = repo.saveForThesis({ symbol: "nvda", thesisVersionId: "thesis-1", conditions: [riskPriceDraft()], now: "2026-08-09T10:00:00Z" });
  expect(saved[0]).toMatchObject({ symbol: "NVDA", thesisVersionId: "thesis-1", deletedAt: undefined });
  expect(saved[0].conditionVersion).toMatch(/^[0-9a-f]{8}$/);
  expect(repo.listForThesis("thesis-1")).toHaveLength(1);
});

test("does not create the same transition alert twice", () => {
  const repo = new MonitorAlertRepository(localStorage);
  const first = repo.createTransition(transitionInput("confirmed", "breached"));
  const second = repo.createTransition(transitionInput("confirmed", "breached"));
  expect(second.id).toBe(first.id);
  expect(repo.list({ view: "pending", now: "2026-08-09T10:00:00Z" })).toHaveLength(1);
});

test("isolates a corrupt stored record without dropping valid records", () => {
  localStorage.setItem("stock_m:thesis-conditions:v1", JSON.stringify([riskCondition(), { id: 42 }]));
  const repo = new ConditionRepository(localStorage);
  expect(repo.listActive()).toEqual([expect.objectContaining({ id: "condition-1" })]);
  expect(repo.getWarnings()).toContain("已跳过 1 条损坏的监控条件");
});
```

- [x] **Step 2: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/*Repository.test.ts src/features/thesis/localThesisRepository.test.ts
```

Expected: FAIL because the repositories and thesis methods do not exist.

- [x] **Step 3: Implement condition and evaluation persistence**

Use exact storage keys:

```ts
const conditionKey = "stock_m:thesis-conditions:v1";
const evaluationKey = "stock_m:condition-evaluations:v1";
```

Validate persisted objects with local type guards before returning them. Return structured clones from every public read. `saveForThesis` rejects a blank thesis id, duplicate draft IDs, invalid `between` bounds, invalid ISO dates, and unsupported metrics. `softDelete` changes only `deletedAt` and `updatedAt`; it never removes history.

`EvaluationRepository.append` deduplicates by `conditionId + conditionVersion + dataState + status + asOf`. `latestDecisive` returns only a fresh confirmed or breached evaluation. Including the condition identity prevents two theses that share the same normalized rule from collapsing into one history entry.

- [x] **Step 4: Implement alert and review persistence**

Use:

```ts
const alertKey = "stock_m:monitor-alerts:v1";
const reviewKey = "stock_m:thesis-reviews:v1";
```

`createTransition` computes `dedupeKey` as `${thesisVersionId}:${conditionId}:${conditionVersion}:${toStatus}:${asOf}` and suppresses initial `pending → confirmed` from the inbox while still allowing the evaluation repository to retain it. Including both owners prevents cross-thesis alert collisions. `list({ view })` semantics:

- `pending`: not archived and either not snoozed or snooze is due;
- `snoozed`: not archived and `snoozedUntil > now`;
- `archived`: `archivedAt` exists.

`ThesisReviewRepository.record` accepts only `reaffirmed`, `invalidated`, or `archived`, and stores an immutable condition-status snapshot plus optional note.

- [x] **Step 5: Upgrade thesis versions without converting legacy text**

Extend `Thesis`:

```ts
export interface Thesis {
  id: string;
  symbol: string;
  coreJudgment: string;
  evidence: string[];
  risks: string[];
  validationConditions: string[];
  version: number;
  createdAt: string;
}
```

`save(input, now = new Date().toISOString())` adds `createdAt`. `getLatest(symbol)` returns the highest version. When old stored theses lack `createdAt`, return them with `createdAt: "1970-01-01T00:00:00.000Z"`; do not rewrite storage and do not parse `validationConditions`.

- [x] **Step 6: Verify repositories and commit**

```powershell
npm test -- src/features/monitoring src/features/thesis/localThesisRepository.test.ts
npm run build
git diff --check
git add src/features/monitoring/conditionRepository.ts src/features/monitoring/conditionRepository.test.ts src/features/monitoring/evaluationRepository.ts src/features/monitoring/evaluationRepository.test.ts src/features/monitoring/monitorAlertRepository.ts src/features/monitoring/monitorAlertRepository.test.ts src/features/monitoring/thesisReviewRepository.ts src/features/monitoring/thesisReviewRepository.test.ts src/features/thesis/localThesisRepository.ts src/features/thesis/localThesisRepository.test.ts
git commit -m "feat: persist thesis monitoring history"
```

---

### Task 3: Batched Monitor Snapshots and Orchestration Service

**Files:**
- Create: `src/features/monitoring/monitorSnapshotLoader.ts`
- Create: `src/features/monitoring/monitorSnapshotLoader.test.ts`
- Create: `src/features/monitoring/thesisMonitorService.ts`
- Create: `src/features/monitoring/thesisMonitorService.test.ts`

**Interfaces:**
- `MonitorSnapshotLoader.load(conditions, now): Promise<Map<string, MonitorSnapshot>>`.
- `ThesisMonitorService.evaluate({ symbols?, now }): Promise<MonitorRunResult>`.
- `ThesisMonitorService.getConditionView(thesisVersionId): ConditionView[]`.
- `ThesisMonitorService.getHealth(symbols): ThesisHealthSummary`.
- Consumes Task 1 evaluator and Task 2 repositories.

- [x] **Step 1: Write failing snapshot-loader tests**

```ts
test("batches quotes, universe metrics, and one event window", async () => {
  const client = completeMarketClient();
  const loader = new MonitorSnapshotLoader(client);
  const snapshots = await loader.load([priceCondition("NVDA"), revenueCondition("MSFT"), earningsCondition("NVDA")], "2026-08-09T10:00:00Z");
  expect(client.getQuotes).toHaveBeenCalledWith(["MSFT", "NVDA"]);
  expect(client.getUniverse).toHaveBeenCalledWith(["MSFT", "NVDA"]);
  expect(client.getEvents).toHaveBeenCalledWith({ from: "2026-08-09", to: "2026-08-31", symbols: ["MSFT", "NVDA"] });
  expect(snapshots.get("NVDA")?.metrics.price).toMatchObject({ value: 167.32, source: "alpaca", dataState: "fresh" });
});

test("marks only the failed resource unavailable", async () => {
  const client = completeMarketClient({ getEvents: async () => { throw new Error("offline"); } });
  const snapshot = (await new MonitorSnapshotLoader(client).load([priceCondition("NVDA"), earningsCondition("NVDA")], now)).get("NVDA")!;
  expect(snapshot.metrics.price?.dataState).toBe("fresh");
  expect(snapshot.eventsState).toBe("unavailable");
});
```

- [x] **Step 2: Write failing service transition tests**

```ts
test("creates one alert when a condition changes from confirmed to breached", async () => {
  const service = monitorServiceWithSnapshots([priceSnapshot(170), priceSnapshot(190)]);
  await service.evaluate({ now: "2026-08-09T10:00:00Z" });
  await service.evaluate({ now: "2026-08-09T10:05:00Z" });
  await service.evaluate({ now: "2026-08-09T10:05:00Z" });
  expect(alertRepository.list({ view: "pending", now: "2026-08-09T10:06:00Z" })).toEqual([
    expect.objectContaining({ symbol: "NVDA", fromStatus: "confirmed", toStatus: "breached" }),
  ]);
});

test("does not alert or overwrite a decisive result when a provider becomes stale", async () => {
  const service = monitorServiceWithSnapshots([priceSnapshot(170), stalePriceSnapshot(190)]);
  const first = await service.evaluate({ now: "2026-08-09T10:00:00Z" });
  const second = await service.evaluate({ now: "2026-08-09T10:05:00Z" });
  expect(first.conditions[0].status).toBe("confirmed");
  expect(second.conditions[0]).toMatchObject({ status: "confirmed", dataState: "stale" });
  expect(alertRepository.list({ view: "pending", now: "2026-08-09T10:06:00Z" })).toEqual([]);
});
```

- [x] **Step 3: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/monitorSnapshotLoader.test.ts src/features/monitoring/thesisMonitorService.test.ts
```

Expected: FAIL because loader and service do not exist.

- [x] **Step 4: Implement resource-aware snapshot loading**

Use one request per resource group:

```ts
await Promise.allSettled([
  client.getQuotes(symbols),
  client.getUniverse(symbols),
  eventConditions.length ? client.getEvents({ from, to, symbols }) : Promise.resolve(undefined),
]);
```

Quotes own `price` and `dailyChangePercent`. Universe data owns all other monitor metrics. If an envelope has `stale` or `fallback`, set the corresponding values to `stale`. A missing field in a successful fresh envelope is `missing`; a rejected resource is `unavailable`. Do not fall back to mock repositories.

- [x] **Step 5: Implement service orchestration and derived health**

For each active condition:

1. read the last fresh decisive result;
2. evaluate current snapshot;
3. append the evaluation idempotently;
4. create an alert only when a decisive status changes, or when the first decisive status is breached/expired;
5. suppress initial confirmed from the inbox.

Health rules:

```ts
if (!conditions.length) return "unmonitored";
if (latestReview?.decision === "invalidated") return "invalidated";
if (latestReview?.decision === "archived") return "archived";
const currentConcerns = concernKeys(currentEvaluations);
const reviewedConcerns = concernKeys(latestReview?.conditionSnapshot ?? []);
const hasUnreviewedConcern = currentConcerns.some((key) => !reviewedConcerns.has(key));
if (latestReview?.decision === "reaffirmed" && !hasUnreviewedConcern) return "normal";
if (hasUnreviewedConcern && (highBreaches > 0 || expired > 0 || mediumBreaches >= 2)) return "review-needed";
return "normal";
```

`concernKeys` returns `${conditionId}:${conditionVersion}:${status}` for breached and expired entries. A `reaffirmed` review acknowledges exactly the concerns captured in its immutable snapshot. Re-evaluating the same condition in the same state does not reopen the thesis; a new concern, a version change, or a state change does.

The service constructor must receive all repositories, loader, evaluator, and clock dependencies; do not instantiate localStorage internally.

- [x] **Step 6: Verify service and commit**

```powershell
npm test -- src/features/monitoring
npm run build
git diff --check
git add src/features/monitoring/monitorSnapshotLoader.ts src/features/monitoring/monitorSnapshotLoader.test.ts src/features/monitoring/thesisMonitorService.ts src/features/monitoring/thesisMonitorService.test.ts
git commit -m "feat: orchestrate thesis monitoring"
```

---

### Task 4: Research Page Condition Editor and Review Panel

**Files:**
- Create: `src/features/monitoring/ConditionEditor.tsx`
- Create: `src/features/monitoring/ConditionEditor.test.tsx`
- Create: `src/features/monitoring/ConditionStatusList.tsx`
- Create: `src/features/monitoring/ResearchMonitorPanel.tsx`
- Create: `src/features/monitoring/ResearchMonitorPanel.test.tsx`
- Create: `src/features/monitoring/monitoring.css`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/features/research/ResearchPage.test.tsx`
- Modify: `src/features/research/ResearchFlow.test.tsx`

**Interfaces:**
- `ConditionEditor({ drafts, onChange })` edits metric and event drafts without persistence.
- `ResearchMonitorPanel({ symbol, marketClient, onThesisSaved })` owns thesis/condition saving, evaluation refresh, and review decisions.
- `onThesisSaved(thesisId)` supplies the real immutable thesis id to the existing paper-buy guard.

- [x] **Step 1: Write failing editor validation tests**

```tsx
test("adds a structured risk price condition", async () => {
  const onChange = vi.fn();
  render(<ConditionEditor drafts={[]} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "添加风险条件" }));
  await user.selectOptions(screen.getByLabelText("条件类型"), "metric");
  await user.selectOptions(screen.getByLabelText("指标"), "price");
  await user.selectOptions(screen.getByLabelText("比较符"), ">=");
  await user.type(screen.getByLabelText("目标值"), "180");
  await user.selectOptions(screen.getByLabelText("严重程度"), "high");
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "metric", direction: "risk", metric: "price", operator: ">=", target: 180, severity: "high" })]);
});

test("requires both bounds for a between condition", async () => {
  renderEditorWithBetweenDraft({ lower: 180, upper: undefined });
  expect(screen.getByRole("alert")).toHaveTextContent("请填写区间上限");
});
```

- [x] **Step 2: Write failing research integration test**

```tsx
test("saves conditions against the new thesis id and uses it for paper buy", async () => {
  renderResearchWithMonitoring();
  await createRiskPriceCondition(180);
  await user.click(screen.getByRole("button", { name: "保存投资逻辑" }));
  expect(conditionRepository.listActive()).toEqual([expect.objectContaining({ thesisVersionId: expect.stringMatching(/^thesis-/), symbol: "NVDA" })]);
  await user.click(screen.getByRole("button", { name: "确认模拟买入" }));
  expect(new PortfolioLedger(localStorage).list()[0].thesisVersionId).toBe(conditionRepository.listActive()[0].thesisVersionId);
});

test("shows a stale evaluation without changing the previous status", async () => {
  renderMonitorPanel({ latestView: conditionView({ status: "confirmed", dataState: "stale", explanation: "旧缓存，保留上次有效结论" }) });
  expect(await screen.findByText("成立")).toBeVisible();
  expect(screen.getByText("旧缓存，保留上次有效结论")).toBeVisible();
});
```

- [x] **Step 3: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/ConditionEditor.test.tsx src/features/monitoring/ResearchMonitorPanel.test.tsx src/features/research/ResearchPage.test.tsx src/features/research/ResearchFlow.test.tsx
```

Expected: FAIL because condition UI and monitor panel do not exist.

- [x] **Step 4: Implement accessible condition editing**

The editor must:

- group support and risk conditions;
- expose only the 12 approved monitor metrics;
- change target controls when operator is `between`;
- expose `before-date`, `within-range`, and `not-occurred-by-date` only for event conditions;
- require `from` only for `within-range`;
- validate deadline and event dates as `YYYY-MM-DD`;
- support draft deletion before save and repository soft deletion after save;
- use labels for every input and keyboard-operable buttons.

- [x] **Step 5: Implement research monitoring and real thesis binding**

Replace the hard-coded thesis save inside `ResearchPage` with `ResearchMonitorPanel`. Keep default field values for the existing demonstration flow, but render editable core judgment, evidence, risks, and legacy validation text. On save:

```ts
const thesis = thesisRepository.save(thesisDraft, now);
conditionRepository.saveForThesis({ symbol, thesisVersionId: thesis.id, conditions: drafts, now });
onThesisSaved(thesis.id);
await monitorService.evaluate({ symbols: [symbol], now });
```

The paper-buy button remains disabled until `onThesisSaved` supplies an id and a live quote exists. Use that exact id in `LocalPortfolioRepository.add` instead of the literal `"v1"`.

- [x] **Step 6: Verify research flow and commit**

```powershell
npm test -- src/features/monitoring src/features/research src/features/thesis src/features/portfolio/localPortfolioRepository.test.ts
npm run build
git diff --check
git add src/features/monitoring/ConditionEditor.tsx src/features/monitoring/ConditionEditor.test.tsx src/features/monitoring/ConditionStatusList.tsx src/features/monitoring/ResearchMonitorPanel.tsx src/features/monitoring/ResearchMonitorPanel.test.tsx src/features/monitoring/monitoring.css src/features/research/ResearchPage.tsx src/features/research/ResearchPage.test.tsx src/features/research/ResearchFlow.test.tsx
git commit -m "feat: add research thesis monitoring"
```

---

### Task 5: Today Review Queue

**Files:**
- Create: `src/features/monitoring/ReviewQueue.tsx`
- Create: `src/features/monitoring/ReviewQueue.test.tsx`
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/today/TodayPage.test.tsx`
- Modify: `src/features/today/today.css`

**Interfaces:**
- `ReviewQueue({ alerts, onRead, onSnooze, onArchive })` is presentational.
- `TodayPage` receives optional `monitorService` and `monitorAlertRepository` dependencies for tests; defaults use localStorage.
- Today triggers one monitor run on mount and after successful “刷新市场数据”.

- [x] **Step 1: Write failing queue interaction tests**

```tsx
test("orders high breaches before expiry and supports inbox actions", async () => {
  const onRead = vi.fn(); const onSnooze = vi.fn(); const onArchive = vi.fn();
  render(<MemoryRouter><ReviewQueue alerts={[expiredAlert(), highBreachAlert()]} onRead={onRead} onSnooze={onSnooze} onArchive={onArchive} /></MemoryRouter>);
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("NVDA 估值风险");
  await user.click(screen.getByRole("button", { name: "标记 NVDA 估值风险为已读" }));
  expect(onRead).toHaveBeenCalledWith("alert-high");
  await user.click(screen.getByRole("button", { name: "稍后处理 NVDA 估值风险" }));
  await user.type(screen.getByLabelText("稍后处理至"), "2026-08-12");
  await user.click(screen.getByRole("button", { name: "确认稍后处理" }));
  expect(onSnooze).toHaveBeenCalledWith("alert-high", "2026-08-12T00:00:00.000Z");
});
```

```tsx
test("runs monitoring after market refresh and shows review-needed alerts", async () => {
  render(<MemoryRouter><TodayPage marketClient={client} monitorService={service} monitorAlertRepository={alerts} /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "需要复核" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "刷新市场数据" }));
  expect(service.evaluate).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("link", { name: "复核 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");
});
```

- [x] **Step 2: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/ReviewQueue.test.tsx src/features/today/TodayPage.test.tsx
```

Expected: FAIL because Today has no monitoring queue.

- [x] **Step 3: Implement queue ordering and actions**

Sort by:

1. high breached;
2. expired;
3. medium breached;
4. low breached;
5. createdAt descending.

Each row renders symbol, condition name, transition, explanation, data time, severity, read state, research link, and action buttons. Snooze requires a future date. Archived and future-snoozed alerts disappear from Today immediately.

- [x] **Step 4: Integrate Today evaluation without blocking market content**

Market pulse and events must render even if monitoring fails. Show monitoring failure only inside the review section. After quote refresh succeeds, await `monitorService.evaluate`, then reload alerts. Restore due snoozes using the same injected clock before listing pending alerts.

- [x] **Step 5: Verify Today and commit**

```powershell
npm test -- src/features/monitoring/ReviewQueue.test.tsx src/features/today/TodayPage.test.tsx
npm run build
git diff --check
git add src/features/monitoring/ReviewQueue.tsx src/features/monitoring/ReviewQueue.test.tsx src/features/today/TodayPage.tsx src/features/today/TodayPage.test.tsx src/features/today/today.css
git commit -m "feat: add today thesis review queue"
```

---

### Task 6: Portfolio Thesis Health

**Files:**
- Create: `src/features/monitoring/PortfolioHealth.tsx`
- Create: `src/features/monitoring/PortfolioHealth.test.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/PortfolioPage.test.tsx`
- Modify: `src/features/portfolio/portfolio.css`

**Interfaces:**
- `PortfolioHealth({ summary })` renders aggregate counts and a symbol-to-health table.
- `PortfolioPage` accepts an optional `monitorService`, evaluates held symbols on mount, and links health rows to research.
- Existing portfolio concentration alerts remain separate from thesis-monitor alerts.

- [x] **Step 1: Write failing portfolio-health tests**

```tsx
test("renders aggregate and per-position thesis health without changing holdings", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "thesis-1", occurredAt: "2026-08-09T10:00:00Z" });
  const service = monitorService({ symbols: { NVDA: "review-needed" }, counts: { breached: 1, expiring: 0, unread: 1 } });
  render(<MemoryRouter><PortfolioPage marketClient={client} monitorService={service} /></MemoryRouter>);
  expect(await screen.findByText("需要复核")).toBeVisible();
  expect(screen.getByText("受损条件 1")).toBeVisible();
  expect(screen.getByRole("link", { name: "复核 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");
  expect(ledger.list()).toHaveLength(1);
});

test("shows unmonitored instead of assuming a position is healthy", async () => {
  renderPortfolioWithHealth({ NVDA: "unmonitored" });
  expect(await screen.findByText("无监控条件")).toBeVisible();
});
```

- [x] **Step 2: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/PortfolioHealth.test.tsx src/features/portfolio/PortfolioPage.test.tsx
```

Expected: FAIL because portfolio health UI and service integration do not exist.

- [x] **Step 3: Implement health presentation and integration**

Render cards for breached, expiring within seven days, and unread alert counts. Render exact labels:

```ts
const healthLabels = {
  normal: "正常",
  "review-needed": "需要复核",
  invalidated: "已失效",
  archived: "已归档",
  unmonitored: "无监控条件",
} as const;
```

Evaluate only non-zero positions. If monitoring fails, keep valuation and ledger usable and show “逻辑健康暂时不可用” in the health section. Never append a sell or other ledger event from health state.

- [x] **Step 4: Verify portfolio and commit**

```powershell
npm test -- src/features/monitoring/PortfolioHealth.test.tsx src/features/portfolio
npm run build
git diff --check
git add src/features/monitoring/PortfolioHealth.tsx src/features/monitoring/PortfolioHealth.test.tsx src/features/portfolio/PortfolioPage.tsx src/features/portfolio/PortfolioPage.test.tsx src/features/portfolio/portfolio.css
git commit -m "feat: show portfolio thesis health"
```

---

### Task 7: Monitor Center, Timeline, Review Decisions, and Navigation

**Files:**
- Create: `src/features/monitoring/MonitorPage.tsx`
- Create: `src/features/monitoring/MonitorPage.test.tsx`
- Create: `src/features/monitoring/ConditionTimeline.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- `/monitor` renders pending, snoozed, and archived alert views.
- `ConditionTimeline` combines evaluation and review history without mutating it.
- Review decisions write through `ThesisReviewRepository` and refresh derived health.

- [x] **Step 1: Write failing monitor-page tests**

```tsx
test("filters the inbox and records a reaffirmed review", async () => {
  renderMonitorPage({ alerts: [nvdaHighAlert(), msftExpiredAlert()] });
  await user.selectOptions(screen.getByLabelText("股票"), "NVDA");
  expect(screen.getByText("NVDA 估值风险")).toBeVisible();
  expect(screen.queryByText("MSFT 财报验证")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认 NVDA 逻辑仍成立" }));
  await user.type(screen.getByLabelText("复核备注"), "需求趋势未改变");
  await user.click(screen.getByRole("button", { name: "保存复核" }));
  expect(reviewRepository.latest("thesis-nvda")).toMatchObject({ decision: "reaffirmed", note: "需求趋势未改变" });
});

test("shows evaluation and review entries in chronological order", () => {
  render(<ConditionTimeline evaluations={[confirmedAt10(), breachedAt11()]} reviews={[reaffirmedAt12()]} />);
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    expect.stringContaining("10:00 成立"),
    expect.stringContaining("11:00 受损"),
    expect.stringContaining("12:00 已复核：逻辑仍成立"),
  ]);
});
```

- [x] **Step 2: Write failing route and navigation test**

```tsx
test("adds the monitoring center to primary navigation", () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "监控" })).toHaveAttribute("href", "/monitor");
});
```

- [x] **Step 3: Run tests and verify RED**

```powershell
npm test -- src/features/monitoring/MonitorPage.test.tsx src/app/AppShell.test.tsx
```

Expected: FAIL because page, route, timeline, and navigation item do not exist.

- [x] **Step 4: Implement monitor inbox and filters**

Views are tabs with accessible names “待处理”, “稍后处理”, and “已归档”. Filters include symbol, severity, `toStatus`, and inclusive date range. Query repositories on every action; do not maintain a divergent page-only copy. Empty states must name the active view.

Timeline entries display local time but sort by stored ISO time. Review forms require a decision and allow an optional note. `invalidated` and `archived` require a non-blank note; `reaffirmed` note remains optional.

- [x] **Step 5: Add route and six-item navigation**

Modify `App.tsx`:

```tsx
<Route path="monitor" element={<MonitorPage />} />
```

Add `["/monitor", "监控"]` between Portfolio and Journal. Update the navigation test to assert exactly six labels: 今日、发现、自选、组合、监控、日志.

- [x] **Step 6: Verify monitor center and commit**

```powershell
npm test -- src/features/monitoring src/app/AppShell.test.tsx
npm run build
git diff --check
git add src/features/monitoring/MonitorPage.tsx src/features/monitoring/MonitorPage.test.tsx src/features/monitoring/ConditionTimeline.tsx src/app/App.tsx src/app/AppShell.tsx src/app/AppShell.test.tsx src/app/app.css
git commit -m "feat: add thesis monitoring center"
```

---

### Task 8: Mutable E2E Fixtures, Full Browser Flow, Documentation, and Completion

**Files:**
- Modify: `server/testing/createFixtureProviders.ts`
- Modify: `server/testing/createFixtureProviders.test.ts`
- Modify: `server/testing/e2eServer.ts`
- Create: `tests/e2e/thesis-monitoring.spec.ts`
- Modify: `tests/e2e/live-market-data.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-09-thesis-monitoring.md`

**Interfaces:**
- Fixture providers add `setQuote(symbol, price, previousClose?)` without affecting production providers.
- E2E server adds test-only `POST /api/testing/market-state`.
- Browser flow proves persistence, transition alerts, review decisions, portfolio health, idempotency, and stale-data safety.

- [x] **Step 1: Write failing fixture mutation tests**

```ts
test("changes the next fixture quote without changing other symbols", async () => {
  const fixtures = createFixtureProviders();
  fixtures.setQuote("NVDA", 190, 167.32);
  const quotes = await fixtures.alpaca.getQuotes(["NVDA", "MSFT"]);
  expect(quotes.data[0]).toMatchObject({ symbol: "NVDA", price: 190, previousClose: 167.32 });
  expect(quotes.data[1]).toMatchObject({ symbol: "MSFT", price: 505.41 });
});

test("validates the test-only market-state route", async () => {
  expect((await request.post("/api/testing/market-state", { data: { symbol: "NVDA<script>", price: 190 } })).status()).toBe(400);
  expect((await request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 190, previousClose: 167.32 } })).ok()).toBeTruthy();
});
```

- [x] **Step 2: Run fixture tests and verify RED**

```powershell
npm test -- server/testing/createFixtureProviders.test.ts
npm run test:e2e -- tests/e2e/thesis-monitoring.spec.ts
```

Expected: fixture unit test fails because `setQuote` does not exist; Playwright fails because the test route and monitoring UI do not exist.

- [x] **Step 3: Implement deterministic market-state mutation**

The route accepts only:

```ts
interface MarketStateRequest {
  symbol: string;
  price: number;
  previousClose?: number;
}
```

Validate symbol with `/^[A-Z0-9.-]+$/`, require finite positive prices, mutate only fixture state, and advance the injected E2E clock by two minutes so the one-minute quote cache expires. Never register this route in `server/app.ts` or production `server/index.ts`.

- [x] **Step 4: Add the complete Chrome flow**

```ts
test("monitors a thesis from condition creation through human review", async ({ page }) => {
  await page.goto("/stocks/NVDA");
  await page.getByRole("button", { name: "添加风险条件" }).click();
  await page.selectOption("[aria-label='指标']", "price");
  await page.selectOption("[aria-label='比较符']", ">=");
  await page.getByLabel("目标值").fill("180");
  await page.selectOption("[aria-label='严重程度']", "high");
  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await expect(page.getByText("成立")).toBeVisible();

  await page.request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 190, previousClose: 167.32 } });
  await page.getByRole("button", { name: "刷新监控" }).click();
  await expect(page.getByText("受损")).toBeVisible();

  await page.getByRole("link", { name: "今日" }).click();
  await expect(page.getByRole("heading", { name: "需要复核" })).toBeVisible();
  await expect(page.getByText("NVDA 估值风险")).toBeVisible();

  await page.getByRole("link", { name: "复核 NVDA" }).click();
  await page.getByRole("button", { name: "确认逻辑仍成立" }).click();
  await page.getByRole("button", { name: "保存复核" }).click();

  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByText("正常")).toBeVisible();

  await page.getByRole("link", { name: "监控" }).click();
  const alertCount = await page.getByText("NVDA 估值风险").count();
  await page.reload();
  await expect(page.getByText("NVDA 估值风险")).toHaveCount(alertCount);
});
```

Add a second flow that injects `fail-next` after one confirmed evaluation and asserts the condition remains confirmed with “等待新数据” and no new breached alert.

- [x] **Step 5: Update README**

Document:

- where structured conditions and monitor history are stored;
- the four condition states and the data-quality rule;
- evaluation triggers and absence of background monitoring;
- alert inbox actions and user-owned thesis decisions;
- explicit statement that invalidated does not sell a position;
- `npm run test:e2e -- tests/e2e/thesis-monitoring.spec.ts`.

- [x] **Step 6: Run complete validation and scans**

```powershell
npm test
npm run build
npm run test:e2e
npm run test:data:smoke
git diff --check
rg -n "ALPACA_API_SECRET_KEY|FINNHUB_API_KEY|FRED_API_KEY" dist
rg -n "mockMarketRepository|mockDiscoveryRepository" src --glob "!*.test.ts" --glob "!*.test.tsx" --glob "!mockMarketRepository.ts" --glob "!mockDiscoveryRepository.ts"
```

Expected:

- all Vitest files pass;
- TypeScript and Vite build pass;
- all stable-Chrome E2E flows pass;
- live smoke skips unconfigured providers or succeeds without fixed-price assertions;
- no whitespace errors;
- no provider environment-variable names in `dist`;
- no production-page imports of mock repositories.

- [x] **Step 7: Mark the plan complete and commit**

Change every completed checkbox in this plan from `[ ]` to `[x]`. Stage only intended files; preserve `readme_work.md` and `chrome/` unless the user separately requests otherwise.

```powershell
git add README.md server/testing/createFixtureProviders.ts server/testing/createFixtureProviders.test.ts server/testing/e2eServer.ts tests/e2e/thesis-monitoring.spec.ts tests/e2e/live-market-data.spec.ts docs/superpowers/plans/2026-08-09-thesis-monitoring.md
git commit -m "test: validate thesis monitoring workflow"
```

## Completion Criteria

- A user can create metric and event conditions on a new immutable thesis version.
- Each condition displays status, actual value, target, source, data time, data quality, and explanation.
- All approved metrics and three event occurrence modes follow deterministic boundary semantics.
- Fresh data may change status; stale, missing, and unavailable data retain the last fresh decisive status.
- Initial confirmed conditions do not clutter Today; breach, expiry, and recovery transitions create one deduplicated alert.
- Today supports read, snooze, archive, and research navigation.
- Portfolio shows aggregate and per-position thesis health without modifying ledger events.
- `/monitor` supports pending, snoozed, archived, filters, timeline, and human review decisions.
- `reaffirmed`, `invalidated`, and `archived` remain user decisions and never place an order.
- Fixture mutation makes the full browser flow deterministic and offline.
- Full unit, interaction, build, smoke, secret, production-mock, and stable-Chrome E2E validation passes.
