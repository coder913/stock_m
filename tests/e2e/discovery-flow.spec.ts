import { expect, test } from "./fixtures";

test("discovers NVDA, adds it to a watchlist, and opens research", async ({ page }) => {
  await page.goto("/watchlist");
  await page.getByLabel("新分组名称").fill("AI 基础设施");
  await page.getByRole("button", { name: "创建分组" }).click();
  await page.getByRole("link", { name: "发现" }).click();
  await page.getByRole("button", { name: "高质量成长" }).click();
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();
  await page.getByRole("button", { name: "加入自选 NVDA" }).click();
  await page.getByLabel("自选分组").selectOption({ label: "AI 基础设施" });
  await page.getByRole("button", { name: "确认加入" }).click();
  await expect(page.getByRole("status")).toContainText("NVDA 已加入 AI 基础设施");
  await page.getByRole("link", { name: "研究 NVDA" }).click();
  await expect(page.getByRole("heading", { name: /NVDA/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同业比较" })).toBeVisible();
});

test("opens a company event from the calendar", async ({ page }) => {
  await page.goto("/discover");
  await page.getByRole("button", { name: "财报日历" }).click();
  await page.getByRole("link", { name: "NVDA 财报" }).click();
  await expect(page).toHaveURL(/\/stocks\/NVDA/);
});
