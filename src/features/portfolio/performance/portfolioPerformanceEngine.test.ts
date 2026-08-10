import { expect, test } from "vitest";
import type { PriceBar } from "../../market/apiDomain";
import type { LedgerEvent, PortfolioSettings } from "../domain";
import type { PerformanceHistoryLoad } from "./domain";
import { calculatePerformance } from "./portfolioPerformanceEngine";

const settings: PortfolioSettings = { version: 1, initialCash: 1000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: "2026-08-10T00:00:00Z" };
const dates = ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
const bars = (symbol: string, closes: number[], selectedDates = dates.slice(0, closes.length), adjusted = false): PriceBar[] => closes.map((close, index) => ({ symbol, startedAt: `${selectedDates[index]}T20:00:00Z`, open: close, high: close, low: close, close, adjusted }));
const event = (input: Omit<LedgerEvent, "id">, id = `${input.type}-${input.occurredAt}`): LedgerEvent => ({ id, ...input });
const history = (input: { events?: LedgerEvent[]; holdingBars?: Record<string, PriceBar[]>; benchmarkBars?: PriceBar[]; settings?: PortfolioSettings; pendingSplits?: PerformanceHistoryLoad["pendingSplits"] } = {}): PerformanceHistoryLoad => ({
  settings: input.settings ?? settings,
  events: input.events ?? [],
  holdingBars: input.holdingBars ?? {},
  benchmarkBars: input.benchmarkBars ?? bars("SPY", dates.map((_, index) => 100 + index), dates, true),
  pendingSplits: input.pendingSplits ?? [],
  notices: [],
  sourceAsOf: { holdings: "2026-08-14T20:00:00Z", benchmark: "2026-08-14T20:00:00Z", events: "2026-08-14T20:00:00Z" },
  resourceStates: { holdings: "fresh", benchmark: "fresh", events: "fresh" },
  dataState: "fresh",
});
const calculate = (value: PerformanceHistoryLoad, from = "2026-08-04", to = "2026-08-14") => calculatePerformance({ history: value, from, to });

test("separates deposits from investment return", () => {
  const deposit = event({ type: "deposit", amount: 500, reason: "追加资金", occurredAt: "2026-08-05T15:00:00Z" });
  const result = calculate(history({ events: [deposit], benchmarkBars: bars("SPY", [100, 100], dates.slice(0, 2), true) }), "2026-08-04", "2026-08-05");
  expect(result.points.at(-1)?.totalValue).toBe(1500);
  expect(result.summary.twr).toBeCloseTo(0);
});

test("applies split before valuation and preserves value", () => {
  const events = [
    event({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" }),
    event({ type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:split", confirmedAt: "2026-08-06T12:00:00Z", occurredAt: "2026-08-06T00:00:00Z" }),
  ];
  const selectedDates = dates.slice(0, 4);
  const result = calculate(history({ events, holdingBars: { NVDA: bars("NVDA", [100, 105, 52.5, 55], selectedDates) }, benchmarkBars: bars("SPY", [100, 101, 102, 103], selectedDates, true) }), "2026-08-04", "2026-08-07");
  expect(result.dailyInternals.find((day) => day.marketDate === "2026-08-06")?.positions.NVDA.quantity).toBe(20);
  expect(result.points.map((point) => point.totalValue)).toEqual([1000, 1050, 1050, 1100]);
});

test("carries five missing closes and makes the sixth unavailable", () => {
  const buy = event({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" });
  const result = calculate(history({ events: [buy], holdingBars: { NVDA: bars("NVDA", [100], [dates[0]]) } }));
  expect(result.points.slice(1, 6).every((point) => point.dataState === "stale")).toBe(true);
  expect(result.points[6]).toMatchObject({ totalValue: undefined, dataState: "unavailable", missingSymbols: ["NVDA"] });
});

test("does not link TWR across an unavailable gap", () => {
  const buy = event({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" });
  const holdingDates = [dates[0], dates[7], dates[8]];
  const result = calculate(history({ events: [buy], holdingBars: { NVDA: bars("NVDA", [100, 100, 102], holdingDates) } }));
  expect(result.summary.availableFrom).toBe(dates[7]);
  expect(result.summary.twr).toBeCloseTo(0.02);
});

test("calculates withdrawals, dividends, fees, benchmark, drawdown, and positive days", () => {
  const selectedDates = dates.slice(0, 4);
  const events = [
    event({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" }),
    event({ type: "dividend", symbol: "NVDA", amount: 20, reason: "分红", occurredAt: "2026-08-05T15:00:00Z" }),
    event({ type: "fee", amount: 5, reason: "费用", occurredAt: "2026-08-06T15:00:00Z" }),
    event({ type: "withdrawal", amount: 10, reason: "提取", occurredAt: "2026-08-07T15:00:00Z" }),
  ];
  const result = calculate(history({ events, holdingBars: { NVDA: bars("NVDA", [100, 110, 99, 108], selectedDates) }, benchmarkBars: bars("SPY", [100, 102, 101, 104], selectedDates, true) }), "2026-08-04", "2026-08-07");
  expect(result.summary.benchmarkReturn).toBeCloseTo(0.04);
  expect(result.summary.maximumDrawdown).toBeGreaterThan(0);
  expect(result.summary.positiveDayRate).toBeGreaterThan(0);
  expect(result.interval.withdrawals).toBe(10);
});

test("withholds annualized return for histories shorter than 30 natural days", () => {
  const result = calculate(history({ benchmarkBars: bars("SPY", [100, 101], dates.slice(0, 2), true) }), "2026-08-04", "2026-08-05");
  expect(result.summary.annualizedReturn).toBeUndefined();
});

test("assigns a weekend external flow to the next valuation subperiod", () => {
  const weekendDeposit = event({ type: "deposit", amount: 500, reason: "周末入金", occurredAt: "2026-08-08T15:00:00Z" });
  const selectedDates = ["2026-08-07", "2026-08-10"];
  const result = calculatePerformance({
    history: history({ events: [weekendDeposit], benchmarkBars: bars("SPY", [100, 100], selectedDates, true) }),
    from: "2026-08-07",
    to: "2026-08-10",
  });
  expect(result.points.at(-1)?.totalValue).toBe(1500);
  expect(result.points.at(-1)?.externalFlow).toBe(500);
  expect(result.summary.twr).toBeCloseTo(0);
});
