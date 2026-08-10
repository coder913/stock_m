import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PortfolioPage } from "./PortfolioPage";
import { PortfolioLedger } from "./portfolioLedger";
import { MemoryRouter } from "react-router-dom";

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

test("uses the live quote for an existing ledger position", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "v1", occurredAt: "2026-08-06T10:00:00Z" });
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [{ symbol: "NVDA", price: 175, previousClose: 170, currency: "USD", marketSession: "regular" }], source: "alpaca", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: false, notices: [] }) };
  render(<PortfolioPage marketClient={client as never} />);
  expect(await screen.findByText("10150.00")).toBeVisible();
  expect(client.getQuotes).toHaveBeenCalledWith(["NVDA"]);
});

test("renders thesis health without changing holdings", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "thesis-1", occurredAt: "2026-08-09T10:00:00Z" });
  const service = { evaluate: vi.fn().mockResolvedValue({ conditions: [], alertsCreated: 0, warnings: [] }), getHealth: vi.fn().mockReturnValue({ breachedCount: 1, expiringCount: 0, unreadAlertCount: 1, items: [{ symbol: "NVDA", thesisVersionId: "thesis-1", status: "review-needed", breachedCount: 1, expiringCount: 0, unreadAlertCount: 1 }] }) };
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [{ symbol: "NVDA", price: 175, previousClose: 170, currency: "USD", marketSession: "regular" }], source: "alpaca", asOf: "2026-08-09T10:00:00Z", fetchedAt: "2026-08-09T10:00:00Z", expiresAt: "2026-08-09T10:01:00Z", stale: false, notices: [] }) };
  render(<MemoryRouter><PortfolioPage marketClient={client as never} monitorService={service as never} /></MemoryRouter>);

  expect(await screen.findByText("需要复核")).toBeVisible();
  expect(screen.getByText("受损条件 1")).toBeVisible();
  expect(screen.getByRole("link", { name: "复核 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");
  expect(ledger.list()).toHaveLength(1);
});

test("keeps valuation visible when thesis monitoring fails", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "thesis-1", occurredAt: "2026-08-09T10:00:00Z" });
  const service = { evaluate: vi.fn().mockRejectedValue(new Error("offline")), getHealth: vi.fn() };
  render(<MemoryRouter><PortfolioPage monitorService={service as never} /></MemoryRouter>);
  expect(await screen.findByText("逻辑健康暂时不可用")).toBeVisible();
  expect(screen.getByText("10134.64")).toBeVisible();
  expect(ledger.list()).toHaveLength(1);
});

test("shows monitoring recovery warnings beside portfolio health", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "thesis-1", occurredAt: "2026-08-09T10:00:00Z" });
  const service = { evaluate: vi.fn().mockResolvedValue({ conditions: [], alertsCreated: 0, warnings: ["skipped corrupt monitoring data"] }), getHealth: vi.fn().mockReturnValue({ breachedCount: 0, expiringCount: 0, unreadAlertCount: 0, items: [{ symbol: "NVDA", thesisVersionId: "thesis-1", status: "normal", breachedCount: 0, expiringCount: 0, unreadAlertCount: 0 }] }) };
  render(<MemoryRouter><PortfolioPage monitorService={service as never} /></MemoryRouter>);

  expect(await screen.findByText("skipped corrupt monitoring data")).toBeVisible();
  expect(screen.getByText("正常", { exact: true })).toBeVisible();
});

test("shows the performance tab and deposit and withdrawal fields", async () => {
  const user = userEvent.setup();
  render(<PortfolioPage />);
  expect(screen.getByRole("tab", { name: "绩效分析" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "持仓与交易" }));
  await user.click(screen.getByRole("button", { name: "记录交易" }));
  await user.selectOptions(screen.getByLabelText("事件类型"), "deposit");
  expect(screen.getByLabelText("金额")).toBeVisible();
  expect(screen.getByLabelText("调整原因")).toBeVisible();
  expect(screen.queryByLabelText("代码")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("事件类型"), "withdrawal");
  expect(screen.getByLabelText("金额")).toBeVisible();
});
