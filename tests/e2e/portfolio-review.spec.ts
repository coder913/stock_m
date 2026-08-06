import { expect, test } from "@playwright/test";

test("records a portfolio event and submits a weekly review", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("tab", { name: "持仓与交易" }).click();
  await page.getByRole("button", { name: "记录交易" }).click();
  await page.getByLabel("事件类型").selectOption("buy");
  await page.getByLabel("数量").fill("20");
  await page.getByLabel("价格").fill("167.32");
  await page.getByRole("button", { name: "确认记录" }).click();
  await page.getByRole("tab", { name: "复盘中心" }).click();
  await expect(page.getByText("NVDA 仓位集中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "提交周报" }).click();
  await expect(page.getByRole("status")).toHaveText("2026-W32 · 版本 1");
});
