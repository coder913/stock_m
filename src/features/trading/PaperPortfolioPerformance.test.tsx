import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DataEnvelope, MarketEvent, PriceBar } from "../market/apiDomain";
import type { PaperLedgerEventView, PaperPortfolioApi } from "./paperPortfolioApiClient";
import { PaperPortfolioPerformance } from "./PaperPortfolioPerformance";

vi.mock("../portfolio/PerformanceChart", () => ({ PerformanceChart: () => null }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const envelope = <T,>(data: T): DataEnvelope<T> => ({ data, source: "alpaca", asOf: "2026-08-05T20:00:00Z", fetchedAt: "2026-08-05T20:00:00Z", expiresAt: "2026-08-05T21:00:00Z", stale: false, notices: [] });
const bars = (symbol: string, closes: number[]): PriceBar[] => closes.map((close, index) => ({ symbol, startedAt: `2026-08-0${index + 4}T13:30:00Z`, open: close, high: close, low: close, close, adjusted: symbol === "SPY" }));
const ledger = (overrides: Partial<PaperLedgerEventView> = {}): PaperLedgerEventView => ({ id: "deposit", remoteSourceId: "activity:deposit", source: "alpaca-paper", eventType: "deposit", amount: "1000.00000000", occurredAt: "2026-08-04T13:00:00Z", provenanceJson: {}, ...overrides });
const paperApi = (events: PaperLedgerEventView[]): PaperPortfolioApi => ({ getOverview: vi.fn(), listOrders: vi.fn(), getTimeline: vi.fn(), cancelOrder: vi.fn(), listLedger: vi.fn().mockResolvedValue(events), reconcile: vi.fn() });
const marketClient = () => ({
  getBatchBars: vi.fn(async (symbols: string[]) => envelope({ symbols: Object.fromEntries(symbols.map((symbol) => [symbol, bars(symbol, symbol === "SPY" ? [100, 101] : [100, 110])])), missingSymbols: [] })),
  getEvents: vi.fn(async (): Promise<DataEnvelope<MarketEvent[]>> => envelope([])),
});

test("calculates Paper returns, SPY comparison, and attribution from the broker ledger", async () => {
  const api = paperApi([
    ledger(),
    ledger({ id: "buy", remoteSourceId: "activity:buy", eventType: "buy", symbol: "NVDA", quantity: "2", price: "100", amount: "-200", occurredAt: "2026-08-04T14:00:00Z" }),
  ]);
  const market = marketClient();

  render(<PaperPortfolioPerformance api={api} marketClient={market} activeDrift={false} />);

  expect(await screen.findByText("比较基准 SPY")).toBeVisible();
  expect(await screen.findByText("贡献已对账")).toBeVisible();
  expect(screen.getByText("时间加权收益").parentElement).toHaveTextContent("2.00%");
  expect(screen.getByText("比较基准", { exact: true }).parentElement).toHaveTextContent("1.00%");
  expect(screen.getByRole("table", { name: "绩效贡献" })).toHaveTextContent("NVDA");
  expect(market.getBatchBars).toHaveBeenCalledTimes(2);
  expect(market.getEvents).toHaveBeenCalledTimes(1);
});

test("does not request market data while Paper drift is active", async () => {
  const api = paperApi([ledger()]);
  const market = marketClient();

  render(<PaperPortfolioPerformance api={api} marketClient={market} activeDrift />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Paper 对账不一致，绩效暂不可用");
  expect(api.listLedger).not.toHaveBeenCalled();
  expect(market.getBatchBars).not.toHaveBeenCalled();
});

test("explains an empty Paper ledger without requesting market data", async () => {
  const market = marketClient();
  render(<PaperPortfolioPerformance api={paperApi([])} marketClient={market} activeDrift={false} />);

  expect(await screen.findByText("暂无 Paper 成交与现金活动")).toBeVisible();
  expect(market.getBatchBars).not.toHaveBeenCalled();
});

test("blocks performance when the broker ledger has no cash origin", async () => {
  const market = marketClient();
  render(<PaperPortfolioPerformance api={paperApi([ledger({ eventType: "buy", symbol: "NVDA", quantity: "1", price: "10", amount: "-10" })])} marketClient={market} activeDrift={false} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Paper 现金历史不足");
  expect(market.getBatchBars).not.toHaveBeenCalled();
});

test("reports broker ledger request failures", async () => {
  const api = paperApi([]);
  vi.mocked(api.listLedger).mockRejectedValue(new Error("offline"));
  render(<PaperPortfolioPerformance api={api} marketClient={marketClient()} activeDrift={false} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Paper 账本加载失败");
});
