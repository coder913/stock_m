import { expect, test } from "vitest";
import type { StockSnapshot } from "./domain";
import { runScreen, validateConditions } from "./screener";
import { systemTemplates } from "./templates";

const fixtures: StockSnapshot[] = [
  {
    symbol: "NVDA",
    name: "英伟达",
    industry: "半导体",
    metrics: { price: 167.32, revenueGrowthYoY: 35, forwardPE: 32 },
  },
  {
    symbol: "AAPL",
    name: "苹果",
    industry: "硬件",
    metrics: { price: 218.72, revenueGrowthYoY: 8, forwardPE: 26 },
  },
  {
    symbol: "MSFT",
    name: "微软",
    industry: "软件",
    metrics: { price: 505.41, revenueGrowthYoY: 16, forwardPE: 30 },
  },
  {
    symbol: "MISSING",
    name: "缺失数据",
    industry: "软件",
    metrics: { price: 20 },
  },
];

test("combines conditions and excludes missing metrics", () => {
  const result = runScreen(fixtures, [
    { id: "growth", metric: "revenueGrowthYoY", operator: ">=", value: 20, period: "TTM" },
    { id: "price", metric: "price", operator: ">=", value: 5, period: "CURRENT" },
  ]);

  expect(result.map((item) => item.symbol)).toEqual(["NVDA"]);
});

test("supports inclusive between boundaries", () => {
  const result = runScreen(fixtures, [
    { id: "pe", metric: "forwardPE", operator: "between", value: [26, 30], period: "FY1" },
  ]);

  expect(result.map((item) => item.symbol)).toEqual(["AAPL", "MSFT"]);
});

test("validates conflicting bounds for the same metric", () => {
  expect(validateConditions([
    { id: "min", metric: "price", operator: ">=", value: 20, period: "CURRENT" },
    { id: "max", metric: "price", operator: "<=", value: 10, period: "CURRENT" },
  ])).toEqual([
    expect.objectContaining({ conditionId: "min", code: "conflict" }),
    expect.objectContaining({ conditionId: "max", code: "conflict" }),
  ]);
});

test("system templates cannot be mutated", () => {
  expect(Object.isFrozen(systemTemplates[0])).toBe(true);
  expect(Object.isFrozen(systemTemplates[0].conditions)).toBe(true);
});

test("default templates use only metrics supported by the live free-data universe", () => {
  expect(systemTemplates.map((template) => ({
    id: template.id,
    metrics: template.conditions.map((condition) => condition.metric),
  }))).toEqual([
    { id: "quality-growth", metrics: ["revenueGrowthYoY", "operatingMargin", "freeCashFlow"] },
    { id: "cashflow-value", metrics: ["freeCashFlowYield", "netDebtToEbitda"] },
    { id: "earnings-improvement", metrics: ["revenueGrowthYoY", "grossMarginYoYChange", "earningsSurprise"] },
    { id: "volume-breakout", metrics: ["priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d"] },
  ]);
});
