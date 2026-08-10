import { expect, test, vi } from "vitest";
import type { DataEnvelope, MarketEvent, PriceBar } from "../../market/apiDomain";
import type { LedgerEvent, PortfolioSettings } from "../domain";
import { PerformanceHistoryLoader } from "./performanceHistoryLoader";

const settings: PortfolioSettings = {
  version: 1,
  initialCash: 10_000,
  inceptionDate: "2026-08-04",
  benchmarkSymbol: "SPY",
  baseCurrency: "USD",
  updatedAt: "2026-08-10T00:00:00Z",
};
const buyNvda: LedgerEvent = { id: "buy-nvda", type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" };
const soldMsft: LedgerEvent = { id: "sell-msft", type: "sell", symbol: "MSFT", quantity: 1, price: 110, reason: "退出", occurredAt: "2026-08-07T15:00:00Z" };

const bar = (symbol: string, close: number): PriceBar => ({ symbol, startedAt: "2026-08-06T20:00:00Z", open: close, high: close, low: close, close, adjusted: symbol === "SPY" });
const envelope = <T,>(data: T, overrides: Partial<DataEnvelope<T>> = {}): DataEnvelope<T> => ({
  data,
  source: "alpaca",
  asOf: "2026-08-06T20:00:00Z",
  fetchedAt: "2026-08-06T20:01:00Z",
  expiresAt: "2026-08-06T20:16:00Z",
  stale: false,
  notices: [],
  ...overrides,
});

const splitCandidate: MarketEvent = {
  id: "alpaca:action:nvda-split",
  type: "split",
  symbol: "NVDA",
  title: "NVDA 2:1 拆股",
  scheduledAt: "2026-08-06",
  timing: "all-day",
  source: "alpaca",
  split: { oldRate: 1, newRate: 2, quantityMultiplier: 2, effectiveDate: "2026-08-06" },
};

const clientFixture = () => ({
  getBatchBars: vi.fn()
    .mockResolvedValueOnce(envelope({ symbols: { MSFT: [bar("MSFT", 110)], NVDA: [bar("NVDA", 55)] }, missingSymbols: [] }))
    .mockResolvedValueOnce(envelope({ symbols: { SPY: [bar("SPY", 620)] }, missingSymbols: [] })),
  getEvents: vi.fn().mockResolvedValue(envelope([splitCandidate], { source: "composite" })),
});

test("loads ever-held symbols raw, benchmark all, and split candidates", async () => {
  const client = clientFixture();
  const result = await new PerformanceHistoryLoader(client).load({
    settings,
    events: [buyNvda, soldMsft],
    ignoredSplitIds: [],
    to: "2026-08-10",
  });

  expect(client.getBatchBars).toHaveBeenNthCalledWith(1, ["MSFT", "NVDA"], { start: "2026-08-04", end: "2026-08-10", adjustment: "raw" });
  expect(client.getBatchBars).toHaveBeenNthCalledWith(2, ["SPY"], { start: "2026-08-04", end: "2026-08-10", adjustment: "all" });
  expect(client.getEvents).toHaveBeenCalledWith({ from: "2026-08-04", to: "2026-08-10", symbols: ["MSFT", "NVDA"] });
  expect(result.pendingSplits).toEqual([expect.objectContaining({ id: "alpaca:action:nvda-split" })]);
  expect(result.dataState).toBe("fresh");
});

test("excludes confirmed, ignored, and out-of-holding split candidates", async () => {
  const client = clientFixture();
  const confirmed: LedgerEvent = { id: "split", type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: splitCandidate.id, confirmedAt: "2026-08-07T00:00:00Z", occurredAt: "2026-08-06T00:00:00Z" };
  const result = await new PerformanceHistoryLoader(client).load({ settings, events: [buyNvda, confirmed], ignoredSplitIds: [], to: "2026-08-10" });
  expect(result.pendingSplits).toEqual([]);

  const ignoredClient = clientFixture();
  const ignored = await new PerformanceHistoryLoader(ignoredClient).load({ settings, events: [buyNvda], ignoredSplitIds: [splitCandidate.id], to: "2026-08-10" });
  expect(ignored.pendingSplits).toEqual([]);
});

test.each(["holdings", "benchmark", "events"] as const)("degrades %s independently", async (failedResource) => {
  const client = clientFixture();
  if (failedResource === "holdings") client.getBatchBars.mockReset().mockRejectedValueOnce(new Error("holdings failed")).mockResolvedValueOnce(envelope({ symbols: { SPY: [bar("SPY", 620)] }, missingSymbols: [] }));
  if (failedResource === "benchmark") client.getBatchBars.mockReset().mockResolvedValueOnce(envelope({ symbols: { NVDA: [bar("NVDA", 55)] }, missingSymbols: [] })).mockRejectedValueOnce(new Error("benchmark failed"));
  if (failedResource === "events") client.getEvents.mockRejectedValueOnce(new Error("events failed"));

  const result = await new PerformanceHistoryLoader(client).load({ settings, events: [buyNvda], ignoredSplitIds: [], to: "2026-08-10" });

  expect(result.resourceStates[failedResource]).toBe("unavailable");
  if (failedResource === "benchmark") expect(result.dataState).toBe("fresh");
  if (failedResource === "events") expect(result.notices).toContain("无法验证拆股事件");
});

test("marks fallback envelopes stale", async () => {
  const client = clientFixture();
  client.getBatchBars.mockReset()
    .mockResolvedValueOnce(envelope({ symbols: { NVDA: [bar("NVDA", 55)] }, missingSymbols: [] }, { fallback: true }))
    .mockResolvedValueOnce(envelope({ symbols: { SPY: [bar("SPY", 620)] }, missingSymbols: [] }));
  const result = await new PerformanceHistoryLoader(client).load({ settings, events: [buyNvda], ignoredSplitIds: [], to: "2026-08-10" });
  expect(result.resourceStates.holdings).toBe("stale");
  expect(result.dataState).toBe("stale");
});
