import { expect, test } from "@playwright/test";

test("serves the complete fixture-backed API surface", async ({ request }) => {
  const routes = [
    "/api/health",
    "/api/market/status",
    "/api/market/quotes?symbols=NVDA",
    "/api/market/bars?symbol=NVDA&timeframe=1Day&start=2026-08-01&end=2026-08-07",
    "/api/companies/NVDA",
    "/api/companies/NVDA/financials",
    "/api/companies/NVDA/filings",
    "/api/companies/NVDA/news?from=2026-08-01&to=2026-08-07",
    "/api/discovery/universe",
    "/api/events?from=2026-08-01&to=2026-08-31&symbols=NVDA",
    "/api/macro/series?ids=CPIAUCSL",
  ];
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.ok(), `${route} returned ${response.status()}`).toBeTruthy();
  }
});

test("uses fixture APIs from discovery through research and portfolio", async ({ page }) => {
  const universeResponse = await page.request.get("/api/discovery/universe");
  expect(await universeResponse.text()).toContain('"items"');
  await page.goto("/discover");
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();
  await page.getByRole("link", { name: "研究 NVDA" }).click();
  await expect(page.getByRole("heading", { name: /NVIDIA Corp/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "NVDA 日 K 线" })).toBeVisible();
  await expect(page.getByRole("link", { name: /查看 10-K 原文/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /打开原文：NVIDIA 发布新产品/ })).toHaveAttribute("href", "https://example.test/news/nvda");
  await expect(page.getByText("NVDA 分红")).toBeVisible();
  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await page.getByRole("button", { name: "确认模拟买入" }).click();
  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByRole("heading", { name: "模拟组合" })).toBeVisible();
});

test("keeps cached quote data after a provider 429", async ({ request }) => {
  const first = await request.get("/api/market/quotes?symbols=NVDA");
  expect(first.ok()).toBeTruthy();
  expect((await first.json()).data[0].price).toBe(167.32);

  await request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  const refreshed = await request.post("/api/cache/refresh", { data: { resource: "quotes", symbols: ["NVDA"] } });
  expect(refreshed.ok()).toBeTruthy();
  const body = await refreshed.json();
  expect(body.data[0].price).toBe(167.32);
  expect(body.stale).toBe(true);
  expect(body.notices.join(" ")).toMatch(/最后成功数据|刷新失败/);
});

test("returns successful event groups when one provider fails", async ({ request }) => {
  await request.post("/api/testing/fail-next", { data: { source: "fred", code: 503 } });
  const response = await request.post("/api/cache/refresh", {
    data: { resource: "events", from: "2026-08-01", to: "2026-08-31", symbols: ["NVDA"] },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.data.some((event: { type: string }) => event.type === "earnings")).toBeTruthy();
  expect(body.data.some((event: { type: string }) => event.type === "dividend")).toBeTruthy();
  expect(body.notices.join(" ")).toContain("部分事件数据暂不可用");
});
