import { expect, test, type Page } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("reconstructs, benchmarks, attributes, and preserves performance", async ({ page }) => {
  await seedPerformanceThroughApi(page, false);
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByText("未确认拆股会阻断生效日后的绩效")).toBeVisible();
  await page.getByRole("button", { name: "确认 NVDA 拆股" }).click();
  await expect(page.getByText("拆股已写入账本")).toBeVisible();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
  await expect(page.getByText("贡献已对账")).toBeVisible();
  await page.getByLabel("比较基准").selectOption("QQQ");
  await expect(page.getByText(/QQQ ·/)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByText(/QQQ ·/)).toBeVisible();
});

test("uses stale performance bars after an Alpaca 429", async ({ page }) => {
  await seedReadyPerformance(page);
  await page.request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  await page.getByRole("button", { name: "刷新绩效" }).click();
  await expect(page.getByText(/旧缓存/)).toBeVisible();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
});

async function seedReadyPerformance(page: Page) {
  await seedPerformanceThroughApi(page, true);
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
}

async function seedPerformanceThroughApi(page: Page, confirmedSplit: boolean) {
  const settings = await page.request.put("/api/v1/portfolio/settings", {
    headers: { "Idempotency-Key": `performance-settings-${confirmedSplit}` },
    data: { initialCash: 1_000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD" },
  });
  expect(settings.ok()).toBeTruthy();
  const buy = await page.request.post("/api/v1/portfolio/ledger-events", {
    headers: { "Idempotency-Key": `performance-buy-${confirmedSplit}` },
    data: { type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "fixture-thesis", occurredAt: "2026-08-04T15:00:00Z" },
  });
  expect(buy.ok()).toBeTruthy();
  if (confirmedSplit) {
    const split = await page.request.post("/api/v1/portfolio/ledger-events", {
      headers: { "Idempotency-Key": "performance-split-confirmed" },
      data: { type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:action:nvda-split", confirmedAt: "2026-08-06T12:00:00Z", occurredAt: "2026-08-06T00:00:00Z" },
    });
    expect(split.ok()).toBeTruthy();
  }
  await page.goto("/portfolio");
}
