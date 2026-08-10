import { expect, test } from "vitest";
import type { DailyPerformanceInternal, PerformanceResult } from "./domain";
import { calculateAttribution } from "./performanceAttribution";

const position = (overrides: Partial<DailyPerformanceInternal["positions"][string]> = {}): DailyPerformanceInternal["positions"][string] => ({
  quantity: 10,
  cost: 1000,
  realizedPnl: 0,
  beginningMarketValue: 1000,
  endingMarketValue: 1000,
  buyCashPaid: 0,
  sellCashReceived: 0,
  realizedPnlChange: 0,
  dividends: 0,
  ...overrides,
});
const result = (days: DailyPerformanceInternal[], twr: number, beginningValue: number, endingValue: number): PerformanceResult => ({
  points: [],
  summary: { from: days[0].marketDate, to: days.at(-1)!.marketDate, availableFrom: days[0].marketDate, twr },
  dailyInternals: days,
  interval: { beginningValue, endingValue, deposits: days.reduce((sum, day) => sum + day.deposits, 0), withdrawals: days.reduce((sum, day) => sum + day.withdrawals, 0) },
  warnings: [],
});
const day = (overrides: Partial<DailyPerformanceInternal> = {}): DailyPerformanceInternal => ({
  marketDate: "2026-08-04",
  valuedAt: "2026-08-04T20:00:00Z",
  periodStartedAt: "2026-08-03T20:00:00Z",
  beginningValue: 1000,
  endingValue: 1015,
  deposits: 0,
  withdrawals: 0,
  externalFlow: 0,
  fees: 5,
  modifiedDietzDenominator: 1000,
  dailyReturn: 0.015,
  positions: { NVDA: position({ dividends: 20 }) },
  dataState: "fresh",
  ...overrides,
});

test("reconciles symbols, dividends, and fees to ending assets", () => {
  const performance = result([day()], 0.015, 1000, 1015);
  const attribution = calculateAttribution(performance);

  expect(attribution.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "symbol:NVDA", dividends: 20, moneyContribution: 20 }),
    expect.objectContaining({ key: "fees", moneyContribution: -5 }),
  ]));
  expect(attribution.totalMoneyPnl).toBeCloseTo(performance.interval.endingValue - performance.interval.beginningValue - performance.interval.deposits + performance.interval.withdrawals, 2);
  expect(attribution.reconciled).toBe(true);
});

test("geometrically links contribution exactly to TWR", () => {
  const first = day({ endingValue: 1100, fees: 0, dailyReturn: 0.1, positions: { NVDA: position({ endingMarketValue: 1100 }) } });
  const second = day({ marketDate: "2026-08-05", valuedAt: "2026-08-05T20:00:00Z", beginningValue: 1100, endingValue: 1210, fees: 0, modifiedDietzDenominator: 1100, dailyReturn: 0.1, positions: { NVDA: position({ beginningMarketValue: 1100, endingMarketValue: 1100 }), MSFT: position({ beginningMarketValue: 0, endingMarketValue: 110, quantity: 1, cost: 100 }) } });
  const attribution = calculateAttribution(result([first, second], 0.21, 1000, 1210));

  expect(attribution.items.reduce((sum, item) => sum + (item.returnContribution ?? 0), 0)).toBeCloseTo(0.21, 8);
  expect(attribution.reconciled).toBe(true);
});

test("returns a diagnostic instead of rows when reconciliation fails", () => {
  const corrupt = result([day({ dailyReturn: 0.5 })], 0.5, 1000, 1015);
  expect(calculateAttribution(corrupt)).toMatchObject({ reconciled: false, items: [], diagnostic: "DAILY_RECONCILIATION_FAILED" });
});
