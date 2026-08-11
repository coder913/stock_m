import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { PaperPortfolioOverview } from "./PaperPortfolioOverview";

afterEach(cleanup);

const api = () => ({
  getOverview: vi.fn().mockResolvedValue({ source: "alpaca-paper", account: { cash: "100", buyingPower: "200", equity: "300", portfolioValue: "300", observedAt: "2026-08-11" }, positions: [{ symbol: "AAPL", quantity: "2", marketValue: "400", averageEntryPrice: "100", observedAt: "2026-08-11" }], asOf: "2026-08-11" }),
  listOrders: vi.fn().mockResolvedValue([]),
  getTimeline: vi.fn(),
  cancelOrder: vi.fn(),
  listLedger: vi.fn().mockResolvedValue([]),
  reconcile: vi.fn(),
});

test("renders only broker-backed Paper account and positions", async () => {
  render(<PaperPortfolioOverview api={api()} />);
  expect(await screen.findByText("AAPL")).toBeInTheDocument();
  expect(screen.getAllByText("100")).toHaveLength(2);
  expect(screen.queryByText("手工组合")).not.toBeInTheDocument();
});

test("switches between Paper overview, performance, and order tabs", async () => {
  const user = userEvent.setup();
  render(<PaperPortfolioOverview api={api()} />);

  expect(await screen.findByRole("tab", { name: "总览" })).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("tab", { name: "绩效" }));
  expect(await screen.findByText("暂无 Paper 成交与现金活动")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "订单" }));
  expect(await screen.findByText("Paper 订单")).toBeVisible();
});
