import { expect, test } from "./fixtures";

const at = "2026-08-07T14:00:00.000Z";
const legacyState: Record<string, unknown> = {
  "stock_m:user-universe:v1": { addedSymbols: ["NVDA"], removedDefaultSymbols: [], version: 1 },
  "stock_m:saved-screens:v1": [{
    id: "screen-migrated", name: "迁移成长", conditions: [{ id: "screen-price", metric: "price", operator: ">=", value: 100, period: "CURRENT" }],
    sort: { metric: "price", direction: "desc" }, version: 1, createdAt: at, updatedAt: at,
  }],
  "stock_m:watchlists:v1": [{ id: "watchlist-migrated", name: "迁移 AI", symbols: ["NVDA"], order: 0, version: 1, createdAt: at, updatedAt: at }, 42],
  "stock_m:theses": [{ id: "thesis-migrated", symbol: "NVDA", version: 1, coreJudgment: "迁移后的核心判断", evidence: ["数据中心需求"], risks: ["估值压缩"], validationConditions: ["下季财报"], createdAt: at }],
  "stock_m:thesis-conditions:v1": [{ id: "condition-migrated", thesisVersionId: "thesis-migrated", symbol: "NVDA", kind: "metric", name: "价格保持强势", direction: "support", severity: "high", metric: "price", operator: ">=", target: 150, period: "CURRENT", conditionVersion: "condition-v1", createdAt: at, updatedAt: at }],
  "stock_m:condition-evaluations:v1": [{ id: "evaluation-migrated", conditionId: "condition-migrated", conditionVersion: "condition-v1", status: "breached", dataState: "fresh", actualValue: 140, targetValue: 150, source: "alpaca", asOf: at, explanation: "价格低于阈值", evaluatedAt: at, changed: true, previousStatus: "confirmed" }],
  "stock_m:monitor-alerts:v1": [{ id: "alert-migrated", dedupeKey: "alert:migrated", symbol: "NVDA", thesisVersionId: "thesis-migrated", conditionId: "condition-migrated", conditionVersion: "condition-v1", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "迁移风险提醒", explanation: "价格条件已受损", asOf: at, createdAt: at }],
  "stock_m:thesis-reviews:v1": [{ id: "thesis-review-migrated", thesisVersionId: "thesis-migrated", symbol: "NVDA", decision: "reaffirmed", note: "继续观察", conditionSnapshot: [{ conditionId: "condition-migrated", conditionVersion: "condition-v1", name: "价格保持强势", severity: "high", status: "breached" }], createdAt: at }],
  "stock_m:portfolio-ledger:v1": [{ id: "ledger-migrated", type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "thesis-migrated", occurredAt: at }],
  "stock_m:portfolio-settings:v1": { version: 1, initialCash: 50_000, inceptionDate: "2026-01-01", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: at },
  "stock_m:ignored-splits:v1": [{ sourceEventId: "split-migrated", symbol: "NVDA", note: "已人工确认", ignoredAt: at }],
  "stock_m:portfolio-alerts:v1": [{ id: "portfolio-alert-migrated", dedupeKey: "portfolio:migrated", rule: "single-position", severity: "warning", symbol: "NVDA", message: "迁移组合提醒", currentValue: 35, threshold: 30, status: "open", createdAt: at, updatedAt: at }],
  "stock_m:portfolio-snapshots:v1": [{ id: "snapshot-migrated", asOf: at, positions: [{ symbol: "NVDA", quantity: 10, averageCost: 100, realizedPnl: 0, sector: "Technology" }], cash: 49_000, totalValue: 50_673.2, sectorExposure: { Technology: 100 } }],
  "stock_m:portfolio-reviews:v1": [{ id: "weekly-review-migrated", week: "2026-W32", version: 1, snapshotId: "snapshot-migrated", judgment: "迁移周报判断", action: "继续持有", result: "按计划执行", nextObservations: ["NVDA 财报"], summary: { tradeCount: 1, openAlertCount: 1 }, createdAt: at }],
};

async function seedLegacyStorage(page: import("@playwright/test").Page, state: Record<string, unknown> = legacyState) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, state);
}

test("migrates every browser category, persists across restart, and keeps later writes API-only", async ({ page, request }) => {
  await seedLegacyStorage(page);
  await page.goto("/");

  await expect(page.getByText("发现 14 条可迁移记录")).toBeVisible();
  await expect(page.getByText("1 条记录将隔离")).toBeVisible();
  const importResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/migration/import"));
  await page.getByRole("button", { name: "备份并迁移" }).click();
  const imported = await importResponse;
  expect(imported.ok(), await imported.text()).toBeTruthy();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("stock_m:server-migration-receipt:v1"))).not.toBeNull();

  const backup = await page.evaluate(() => localStorage.getItem("stock_m:server-migration-backup:v1"));
  const originalWatchlists = await page.evaluate(() => localStorage.getItem("stock_m:watchlists:v1"));
  expect(backup).not.toBeNull();
  expect(originalWatchlists).toBe(JSON.stringify(legacyState["stock_m:watchlists:v1"]));

  await page.goto("/discover");
  await page.getByRole("button", { name: "已保存筛选" }).click();
  await expect(page.getByText("迁移成长", { exact: true })).toBeVisible();

  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "迁移 AI" })).toBeVisible();
  await expect(page.getByText("NVDA", { exact: false }).first()).toBeVisible();

  await page.goto("/stocks/NVDA");
  await expect(page.getByLabel("核心判断")).toHaveValue("迁移后的核心判断");

  await page.goto("/monitor");
  await expect(page.getByText("迁移风险提醒", { exact: true })).toBeVisible();

  await page.goto("/portfolio");
  await page.getByRole("tab", { name: "持仓与交易" }).click();
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText("2026-W32 · 版本 1")).toBeVisible();

  await page.goto("/watchlist");
  await page.getByLabel("新分组名称").fill("服务端新分组");
  await page.getByRole("button", { name: "创建分组" }).click();
  await expect(page.getByRole("heading", { name: "服务端新分组" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("stock_m:watchlists:v1"))).toBe(originalWatchlists);

  const document = JSON.parse(backup!);
  const firstReceipt = await request.get("/api/v1/migration/receipt").then((response) => response.json());
  const replay = await request.post("/api/v1/migration/import", {
    headers: { "Idempotency-Key": `import-${document.manifest.sha256}` },
    data: document,
  });
  expect(replay.status()).toBe(201);
  expect(await replay.json()).toEqual(firstReceipt);
  await expect(request.get("/api/testing/database-state").then((response) => response.json())).resolves.toMatchObject({ migrationReceipts: 1, watchlists: 2, theses: 1, ledgerEvents: 1, weeklyReviews: 1 });

  const serverInstanceId = (await request.get("/api/testing/database-state").then((response) => response.json())).serverInstanceId;
  const restart = await request.post("/api/testing/restart");
  expect(restart.ok()).toBeTruthy();
  await expect.poll(async () => {
    try {
      const response = await request.get("/api/testing/database-state");
      return response.ok() ? (await response.json()).serverInstanceId : serverInstanceId;
    } catch { return serverInstanceId; }
  }, { timeout: 15_000 }).not.toBe(serverInstanceId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "迁移 AI" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "服务端新分组" })).toBeVisible();

  const fresh = await request.get("/api/market/quotes?symbols=NVDA");
  expect(fresh.ok()).toBeTruthy();
  expect((await fresh.json()).stale).toBe(false);
  await request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  const stale = await request.get("/api/market/quotes?symbols=NVDA");
  expect(stale.ok()).toBeTruthy();
  expect(await stale.json()).toMatchObject({ stale: true, data: [{ symbol: "NVDA", price: 167.32 }] });
});

test("blocks migration into non-empty server state without partial imports", async ({ page, request }) => {
  const seeded = await request.post("/api/v1/watchlists", {
    headers: { "Idempotency-Key": "seed-conflict-watchlist" },
    data: { name: "服务端已有分组" },
  });
  expect(seeded.status()).toBe(201);
  await seedLegacyStorage(page, { "stock_m:theses": legacyState["stock_m:theses"] });

  await page.goto("/");

  await expect(page.getByRole("alert")).toHaveText("服务端已有状态，自动迁移已阻止");
  await expect(request.get("/api/testing/database-state").then((response) => response.json())).resolves.toMatchObject({ migrationReceipts: 0, migrationRecords: 0, watchlists: 1, theses: 0 });
});
