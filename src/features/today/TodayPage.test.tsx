import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { TodayPage } from "./TodayPage";
import type { MonitorAlert } from "../monitoring/domain";

afterEach(cleanup);
const emptyMonitorState = { listAlerts: vi.fn(async () => []), listEvaluations: vi.fn(async () => []), recordEvaluation: vi.fn(), getAlert: vi.fn(), recordAlert: vi.fn(), act: vi.fn(), listAlertActions: vi.fn(async () => []), listReviews: vi.fn(async () => []), recordReview: vi.fn() };

test("changes the research action when the selected signal changes", async () => {
  render(<MemoryRouter><TodayPage monitorState={emptyMonitorState as never} /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "今天值得关注" })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("link", { name: "研究 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");

  await userEvent.click(screen.getByRole("button", { name: "查看 AAPL" }));
  expect(screen.getByRole("link", { name: "研究 AAPL" })).toHaveAttribute("href", "/stocks/AAPL");
});

test("renders live index quotes and refreshes their batch", async () => {
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [{ symbol: "SPY", price: 620, currency: "USD", marketSession: "regular" }], source: "alpaca", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: false, delayMinutes: 15, notices: [] }), refresh: vi.fn().mockResolvedValue({}) };
  render(<MemoryRouter><TodayPage marketClient={client as never} monitorState={emptyMonitorState as never} /></MemoryRouter>);
  expect(await screen.findByText("620")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "刷新市场数据" }));
  expect(client.refresh).toHaveBeenCalledWith({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] });
});

test("requests a server-side monitoring run and shows durable review-needed alerts", async () => {
  const user = userEvent.setup();
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [], source: "alpaca", asOf: "2026-08-09T10:00:00Z", fetchedAt: "2026-08-09T10:00:00Z", expiresAt: "2026-08-09T10:01:00Z", stale: false, notices: [] }), getEvents: vi.fn().mockResolvedValue({ data: [], source: "finnhub", asOf: "2026-08-09T10:00:00Z", fetchedAt: "2026-08-09T10:00:00Z", expiresAt: "2026-08-09T11:00:00Z", stale: false, notices: [] }), refresh: vi.fn().mockResolvedValue({}) };
  const reviewAlert: MonitorAlert = { id: "alert-1", dedupeKey: "key", symbol: "NVDA", thesisVersionId: "thesis-1", conditionId: "condition-1", conditionVersion: "deadbeef", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "NVDA 估值风险", explanation: "价格突破", createdAt: "2026-08-09T10:00:00Z" };
  const monitorState = { ...emptyMonitorState, listAlerts: vi.fn(async () => [reviewAlert]), requestRun: vi.fn(async () => ({ runs: [] })) };
  render(<MemoryRouter><TodayPage marketClient={client as never} monitorState={monitorState as never} now={() => "2026-08-09T10:00:00Z"} /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "需要复核" })).toBeVisible();
  expect(await screen.findByRole("link", { name: "复核 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");
  await user.click(screen.getByRole("button", { name: "刷新监控" }));
  expect(monitorState.requestRun).toHaveBeenCalledTimes(1);
});

test("keeps market content visible when monitoring fails", async () => {
  const monitorState = { ...emptyMonitorState, listAlerts: vi.fn().mockRejectedValue(new Error("offline")) };
  render(<MemoryRouter><TodayPage monitorState={monitorState as never} /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "今天值得关注" })).toBeVisible();
  expect(await screen.findByText("投资逻辑监控暂时不可用")).toBeVisible();
});
