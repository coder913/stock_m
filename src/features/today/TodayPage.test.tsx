import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { TodayPage } from "./TodayPage";

afterEach(cleanup);

test("changes the research action when the selected signal changes", async () => {
  render(<MemoryRouter><TodayPage /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "今天值得关注" })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("link", { name: "研究 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");

  await userEvent.click(screen.getByRole("button", { name: "查看 AAPL" }));
  expect(screen.getByRole("link", { name: "研究 AAPL" })).toHaveAttribute("href", "/stocks/AAPL");
});

test("renders live index quotes and refreshes their batch", async () => {
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [{ symbol: "SPY", price: 620, currency: "USD", marketSession: "regular" }], source: "alpaca", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: false, delayMinutes: 15, notices: [] }), refresh: vi.fn().mockResolvedValue({}) };
  render(<MemoryRouter><TodayPage marketClient={client as never} /></MemoryRouter>);
  expect(await screen.findByText("620")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "刷新市场数据" }));
  expect(client.refresh).toHaveBeenCalledWith({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] });
});
