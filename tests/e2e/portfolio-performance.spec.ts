import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

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
  await page.getByLabel("发生日期").fill("2026-08-04");
  await page.getByLabel("金额").fill("500");
  await page.getByLabel("调整原因").fill("追加资金");
  await page.getByRole("button", { name: "确认记录" }).click();
  await page.getByRole("button", { name: "记录交易" }).click();
  await page.getByLabel("事件类型").selectOption("buy");
  await page.getByLabel("发生日期").fill("2026-08-04");
  await page.getByLabel("代码").fill("NVDA");
  await page.getByLabel("数量").fill("10");
  await page.getByLabel("价格").fill("100");
  await page.getByRole("button", { name: "确认记录" }).click();
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
  await page.goto("/portfolio");
  await page.evaluate(() => {
    localStorage.setItem("stock_m:portfolio-settings:v1", JSON.stringify({ version: 1, initialCash: 1000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: "2026-08-04T00:00:00Z" }));
    localStorage.setItem("stock_m:portfolio-ledger:v1", JSON.stringify([
      { id: "buy-1", type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "fixture-thesis", occurredAt: "2026-08-04T15:00:00Z" },
      { id: "split-1", type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:action:nvda-split", confirmedAt: "2026-08-06T12:00:00Z", occurredAt: "2026-08-06T00:00:00Z" },
    ]));
  });
  await page.reload();
  await page.getByRole("tab", { name: "绩效分析" }).click();
  await expect(page.getByTestId("normalized-performance-chart")).toBeVisible();
}
