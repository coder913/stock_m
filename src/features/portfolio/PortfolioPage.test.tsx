import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PortfolioPage } from "./PortfolioPage";
import { PortfolioLedger } from "./portfolioLedger";
import { MemoryRouter } from "react-router-dom";
import { ReviewRepository } from "./reviewRepository";

function portfolioState() { const ledger=new PortfolioLedger(localStorage);const reviews=new ReviewRepository(localStorage);let alerts:any[]=[];return {getBootstrap:async()=>({revision:ledger.list().length,settings:{version:1 as const,initialCash:10_000,inceptionDate:"2026-08-01",benchmarkSymbol:"SPY",baseCurrency:"USD" as const,updatedAt:"2026-08-10T00:00:00Z"},events:ledger.list(),ignoredSplits:[],alerts,reviews:reviews.list()}),append:async(input:any)=>ledger.append(input),saveSettings:async(input:any)=>({...input,version:1 as const,updatedAt:"2026-08-10T00:00:00Z"}),ignoreSplit:async(input:any)=>input,reconcileAlerts:async(input:any[])=>{alerts=input.map((item,index)=>({...item,id:`alert-${index}`,status:"open",createdAt:"2026-08-10T00:00:00Z",updatedAt:"2026-08-10T00:00:00Z"}));return alerts;},actAlert:async(id:string,input:any)=>{const alert=alerts.find(item=>item.id===id);if(input.type==="resolve")alert.status="resolved";if(input.type==="snooze"){alert.status="snoozed";alert.snoozedUntil=input.until;}return alert;},submitReview:async(input:any)=>reviews.submit(input)};}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("shows portfolio tabs and records a dividend using the amount form", async () => {
  const user = userEvent.setup();
  render(<PortfolioPage portfolioState={portfolioState() as never} />);
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
  render(<PortfolioPage portfolioState={portfolioState() as never} />);
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
  render(<PortfolioPage marketClient={client as never} portfolioState={portfolioState() as never} />);
  expect(await screen.findByText("10150.00")).toBeVisible();
  expect(client.getQuotes).toHaveBeenCalledWith(["NVDA"]);
});

test("uses persisted reviews to clear a reviewed server-side concern", async () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 2, price: 100, thesisVersionId: "thesis-1", occurredAt: "2026-08-09T10:00:00Z" });
  const alert = { id: "alert-1", dedupeKey: "alert-1", symbol: "NVDA", thesisVersionId: "thesis-1", conditionId: "condition-1", conditionVersion: "condition-v1", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "NVDA 估值风险", explanation: "风险条件已触发", createdAt: "2026-08-09T11:00:00Z" };
  const monitorState = {
    listAlerts: vi.fn(async () => [alert]),
    listReviews: vi.fn(async () => [{ id: "review-1", thesisVersionId: "thesis-1", symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: [{ conditionId: "condition-1", conditionVersion: "condition-v1", name: "估值风险", severity: "high", status: "breached" }], createdAt: "2026-08-09T12:00:00Z" }]),
  };

  render(<MemoryRouter><PortfolioPage monitorState={monitorState as never} portfolioState={portfolioState() as never} /></MemoryRouter>);

  expect(await screen.findByText("正常", { exact: true })).toBeVisible();
  expect(monitorState.listReviews).toHaveBeenCalledWith("thesis-1");
});

test("shows the performance tab and deposit and withdrawal fields", async () => {
  const user = userEvent.setup();
  render(<PortfolioPage portfolioState={portfolioState() as never} />);
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
