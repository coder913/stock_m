import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DiscoveryPage } from "./DiscoveryPage";
import { SavedScreenRepository } from "./savedScreenRepository";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("selecting a template updates conditions and matching results", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><DiscoveryPage /></MemoryRouter>);

  await user.click(await screen.findByRole("button", { name: "高质量成长" }));

  expect(screen.getByText("营收同比增长")).toBeVisible();
  expect(screen.getByRole("row", { name: /NVDA/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /XOM/ })).not.toBeInTheDocument();
});

test("runs, duplicates, renames, and removes a saved screen", async () => {
  const repository = new SavedScreenRepository(localStorage);
  repository.save({ name: "成长", conditions: [{ id: "price", metric: "price", operator: ">=", value: 5, period: "CURRENT" }], sort: { metric: "price", direction: "asc" } });
  const user = userEvent.setup();
  render(<MemoryRouter><DiscoveryPage /></MemoryRouter>);

  await user.click(screen.getByRole("button", { name: "已保存筛选" }));
  await user.click(screen.getByRole("button", { name: "复制 成长" }));
  await user.click(screen.getByRole("button", { name: "重命名 成长副本" }));
  await user.clear(screen.getByLabelText("重命名输入"));
  await user.type(screen.getByLabelText("重命名输入"), "价值");
  await user.click(screen.getByRole("button", { name: "确认重命名" }));
  await user.click(screen.getByRole("button", { name: "删除 价值" }));

  expect(screen.queryByText("价值")).not.toBeInTheDocument();
  expect(screen.getByText("成长")).toBeVisible();
});

test("loads screener rows from the live discovery universe", async () => {
  const client = { getUniverse: vi.fn().mockResolvedValue({ data: { version: "v1", generatedAt: "2026-08-07T10:00:00Z", items: [{ symbol: "LIVE", kind: "stock", name: "Live Corp", sector: "Technology", metrics: { price: 42, revenueGrowthYoY: 30, epsGrowthYoY: 20, grossMarginVsIndustryMedian: 1, freeCashFlow: 10 }, coverage: { status: "ready", availableMetrics: 5, totalMetrics: 14 } }] }, source: "composite", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: false, notices: [] }) };
  render(<MemoryRouter><DiscoveryPage marketClient={client as never} /></MemoryRouter>);
  expect(await screen.findByRole("row", { name: /LIVE/ })).toBeVisible();
});
