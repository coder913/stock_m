import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  const response = await page.request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 167.32, previousClose: 165 } });
  expect(response.ok()).toBeTruthy();
});

test("validates the test-only market-state route", async ({ request }) => {
  expect((await request.post("/api/testing/market-state", { data: { symbol: "NVDA<script>", price: 190 } })).status()).toBe(400);
  expect((await request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 190, previousClose: 167.32 } })).ok()).toBeTruthy();
});

test("monitors a thesis from condition creation through human review", async ({ page }) => {
  await page.goto("/stocks/NVDA");
  await expect(page.getByRole("heading", { name: /NVDA.*NVIDIA Corp/ })).toBeVisible();
  await page.getByRole("button", { name: "添加风险条件" }).click();
  await page.selectOption("[aria-label='指标']", "price");
  await page.selectOption("[aria-label='比较符']", ">=");
  await page.getByLabel("目标值").fill("180");
  await page.selectOption("[aria-label='严重程度']", "high");
  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await expect(page.getByText("成立", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认模拟买入" }).click();

  await page.request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 190, previousClose: 167.32 } });
  await page.getByRole("button", { name: "刷新监控" }).click();
  await expect(page.getByText("受损", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "刷新监控" }).click();
  await expect(page.getByText("受损", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("stock_m:monitor-alerts:v1") || "[]").length)).toBe(1);

  await page.getByRole("link", { name: "今日" }).click();
  await expect(page.getByRole("heading", { name: "需要复核" })).toBeVisible();
  await expect(page.getByText("NVDA 估值风险")).toBeVisible();
  await page.getByRole("link", { name: "复核 NVDA" }).click();
  await page.getByRole("button", { name: "确认逻辑仍成立" }).click();
  await page.getByRole("button", { name: "保存复核" }).click();

  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByText("正常", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "监控" }).click();
  await expect(page.getByRole("heading", { name: "投资逻辑监控" })).toBeVisible();
  const alertCount = await page.getByText("NVDA 估值风险").count();
  expect(alertCount).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText("NVDA 估值风险")).toHaveCount(alertCount);
});

test("retains the confirmed decision when quote refresh falls back to stale cache", async ({ page }) => {
  await page.goto("/stocks/NVDA");
  await page.getByRole("button", { name: "添加风险条件" }).click();
  await page.getByLabel("目标值").fill("180");
  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await expect(page.getByText("成立", { exact: true })).toBeVisible();

  await page.request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  await page.getByRole("button", { name: "刷新监控" }).click();
  await expect(page.getByText("成立", { exact: true })).toBeVisible();
  await expect(page.getByText(/等待新数据/).first()).toBeVisible();
  await page.getByRole("link", { name: "今日" }).click();
  await expect(page.getByText("当前没有需要复核的投资逻辑。")).toBeVisible();
});
