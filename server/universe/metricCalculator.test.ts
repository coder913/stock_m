// @vitest-environment node
import { expect, test } from "vitest";
import { calculateScreenerMetrics } from "./metricCalculator";

test("calculates supported free-source screener metrics and leaves forward estimates absent", () => {
  const metrics = calculateScreenerMetrics({ quote: { price: 120, previousClose: 100, volume: 300 }, dailyBars: Array.from({ length: 20 }, (_, index) => ({ symbol: "NVDA", startedAt: `2026-07-${index + 1}`, open: 100, high: 125, low: 90, close: 120, volume: 200, adjusted: true })), financials: [
    { symbol: "NVDA", statement: "income", concept: "Revenues", label: "Revenue", value: 1200, unit: "USD", periodEnd: "2026-01-01", form: "10-K", filedAt: "2026-01-01", accessionNumber: "a" },
    { symbol: "NVDA", statement: "income", concept: "Revenues", label: "Revenue", value: 1000, unit: "USD", periodEnd: "2025-01-01", form: "10-K", filedAt: "2025-01-01", accessionNumber: "b" },
    { symbol: "NVDA", statement: "income", concept: "OperatingIncomeLoss", label: "Operating income", value: 240, unit: "USD", periodEnd: "2026-01-01", form: "10-K", filedAt: "2026-01-01", accessionNumber: "a" },
    { symbol: "NVDA", statement: "cash-flow", concept: "NetCashProvidedByUsedInOperatingActivities", label: "CFO", value: 300, unit: "USD", periodEnd: "2026-01-01", form: "10-K", filedAt: "2026-01-01", accessionNumber: "a" },
    { symbol: "NVDA", statement: "cash-flow", concept: "PaymentsToAcquirePropertyPlantAndEquipment", label: "Capex", value: 80, unit: "USD", periodEnd: "2026-01-01", form: "10-K", filedAt: "2026-01-01", accessionNumber: "a" },
  ], marketCapUsdMillions: 10_000 });
  expect(metrics.price).toBe(120); expect(metrics.dailyChangePercent).toBeCloseTo(20); expect(metrics.revenueGrowthYoY).toBeCloseTo(20); expect(metrics.operatingMargin).toBeCloseTo(20); expect(metrics.freeCashFlow).toBe(220); expect(metrics.freeCashFlowYield).toBeCloseTo(2.2); expect(metrics.priceVs20DayHigh).toBeCloseTo(-4); expect(metrics.relativeVolume).toBeCloseTo(1.5);
  expect(metrics.forwardPE).toBeUndefined(); expect(metrics.peg).toBeUndefined(); expect(metrics.nextFyEpsRevision30d).toBeUndefined();
});

test("calculates margins, debt and earnings surprise only with valid denominators", () => {
  const fact = (concept: string, value: number) => ({ symbol: "NVDA", statement: "income" as const, concept, label: concept, value, unit: "USD", periodEnd: "2026-01-01", form: "10-K", filedAt: "2026-01-01", accessionNumber: concept });
  const metrics = calculateScreenerMetrics({ financials: [fact("Revenues", 1000), fact("CostOfRevenue", 400), fact("LongTermDebt", 500), fact("CashAndCashEquivalentsAtCarryingValue", 100), fact("EarningsBeforeInterestTaxesDepreciationAndAmortization", 200)], earnings: { epsActual: 1.2, epsEstimate: 1 } });
  expect(metrics.grossMargin).toBeCloseTo(60);
  expect(metrics.netDebtToEbitda).toBeCloseTo(2);
  expect(metrics.earningsSurprise).toBeCloseTo(20);
});

test("calculates year-over-year gross-margin change from matching revenue and cost periods", () => {
  const fact = (concept: string, value: number, periodEnd: string) => ({ symbol: "NVDA", statement: "income" as const, concept, label: concept, value, unit: "USD", periodEnd, form: "10-K", filedAt: periodEnd, accessionNumber: `${concept}:${periodEnd}` });
  const metrics = calculateScreenerMetrics({ financials: [
    fact("Revenues", 1000, "2026-01-31"),
    fact("CostOfRevenue", 350, "2026-01-31"),
    fact("Revenues", 800, "2025-01-31"),
    fact("CostOfRevenue", 320, "2025-01-31"),
  ] });

  expect(metrics.grossMarginYoYChange).toBeCloseTo(5);
});

test("does not combine revenue and cost facts from different reporting periods", () => {
  const fact = (concept: string, value: number, periodEnd: string) => ({ symbol: "NVDA", statement: "income" as const, concept, label: concept, value, unit: "USD", periodEnd, form: "10-K", filedAt: periodEnd, accessionNumber: `${concept}:${periodEnd}` });
  const metrics = calculateScreenerMetrics({ financials: [
    fact("Revenues", 1000, "2026-01-31"),
    fact("Revenues", 800, "2025-01-31"),
    fact("CostOfRevenue", 320, "2025-01-31"),
  ] });

  expect(metrics.grossMargin).toBeUndefined();
  expect(metrics.grossMarginYoYChange).toBeUndefined();
});
