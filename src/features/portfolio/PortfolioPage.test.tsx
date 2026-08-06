import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PortfolioPage } from "./PortfolioPage";
import { PortfolioLedger } from "./portfolioLedger";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("shows portfolio tabs and records a dividend using the amount form", async () => {
  const user = userEvent.setup();
  render(<PortfolioPage />);
  expect(screen.getByRole("tab", { name: "组合总览" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "持仓与交易" }));
  await user.click(screen.getByRole("button", { name: "记录交易" }));
  await user.selectOptions(screen.getByLabelText("事件类型"), "dividend");
  expect(screen.getByLabelText("金额")).toBeVisible();
  expect(screen.queryByLabelText("数量")).not.toBeInTheDocument();
});

test("snoozes a concentration alert and creates a versioned weekly review", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 20, price: 167.32, thesisVersionId: "v1", occurredAt: "2026-08-06T10:00:00Z" });
  const user = userEvent.setup();
  render(<PortfolioPage />);
  await user.click(screen.getByRole("tab", { name: "复盘中心" }));
  expect(screen.getByText("NVDA 仓位集中")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "暂缓 NVDA 仓位集中" }));
  await user.type(screen.getByLabelText("恢复日期"), "2026-08-10");
  await user.click(screen.getByRole("button", { name: "确认暂缓" }));
  expect(screen.getByText("已暂缓至 2026-08-10")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "提交周报" }));
  expect(await screen.findByRole("status")).toHaveTextContent("2026-W32 · 版本 1");
});
