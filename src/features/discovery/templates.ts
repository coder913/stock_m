import type { MetricDefinition, ScreenerTemplate } from "./domain";

export const metricDefinitions: readonly MetricDefinition[] = Object.freeze([
  { metric: "price", label: "价格", unit: "USD", defaultPeriod: "CURRENT" },
  { metric: "revenueGrowthYoY", label: "营收同比增长", unit: "%", defaultPeriod: "TTM" },
  { metric: "epsGrowthYoY", label: "EPS 同比增长", unit: "%", defaultPeriod: "TTM" },
  { metric: "grossMarginVsIndustryMedian", label: "毛利率较行业中位数", unit: "%", defaultPeriod: "TTM" },
  { metric: "freeCashFlow", label: "自由现金流", unit: "USDm", defaultPeriod: "TTM" },
  { metric: "forwardPEToIndustryMedian", label: "预期市盈率/行业中位数", unit: "ratio", defaultPeriod: "FY1" },
  { metric: "peg", label: "PEG", unit: "ratio", defaultPeriod: "FY1" },
  { metric: "freeCashFlowYield", label: "自由现金流收益率", unit: "%", defaultPeriod: "TTM" },
  { metric: "netDebtToEbitda", label: "净负债/EBITDA", unit: "ratio", defaultPeriod: "TTM" },
  { metric: "earningsSurprise", label: "最近季度超预期", unit: "%", defaultPeriod: "MRQ" },
  { metric: "nextFyEpsRevision30d", label: "下一财年 EPS 30 日修正", unit: "%", defaultPeriod: "FY1" },
  { metric: "grossMarginYoYChange", label: "毛利率同比变化", unit: "%", defaultPeriod: "MRQ" },
  { metric: "priceVs20DayHigh", label: "较 20 日高点", unit: "%", defaultPeriod: "CURRENT" },
  { metric: "relativeVolume", label: "相对成交量", unit: "ratio", defaultPeriod: "CURRENT" },
  { metric: "averageDollarVolume20d", label: "20 日平均成交额", unit: "USDm", defaultPeriod: "CURRENT" },
]);

const freezeTemplate = (template: ScreenerTemplate): ScreenerTemplate => Object.freeze({
  ...template,
  conditions: Object.freeze(template.conditions.map((condition) => Object.freeze({ ...condition }))),
});

export const systemTemplates: readonly ScreenerTemplate[] = Object.freeze([
  freezeTemplate({
    id: "quality-growth",
    name: "高质量成长",
    description: "以增长、盈利质量和现金流识别成长候选。",
    conditions: [
      { id: "revenue-growth", metric: "revenueGrowthYoY", operator: ">=", value: 20, period: "TTM" },
      { id: "eps-growth", metric: "epsGrowthYoY", operator: ">", value: 0, period: "TTM" },
      { id: "gross-margin", metric: "grossMarginVsIndustryMedian", operator: ">=", value: 0, period: "TTM" },
      { id: "free-cash-flow", metric: "freeCashFlow", operator: ">", value: 0, period: "TTM" },
    ],
  }),
  freezeTemplate({
    id: "reasonable-valuation",
    name: "合理估值",
    description: "以相对估值、现金回报和杠杆约束筛选。",
    conditions: [
      { id: "forward-pe", metric: "forwardPEToIndustryMedian", operator: "<=", value: 1.2, period: "FY1" },
      { id: "peg", metric: "peg", operator: "<=", value: 2, period: "FY1" },
      { id: "fcf-yield", metric: "freeCashFlowYield", operator: ">=", value: 2, period: "TTM" },
      { id: "leverage", metric: "netDebtToEbitda", operator: "<=", value: 3, period: "TTM" },
    ],
  }),
  freezeTemplate({
    id: "earnings-improvement",
    name: "财报改善",
    description: "聚焦业绩超预期、预期上调与利润率改善。",
    conditions: [
      { id: "surprise", metric: "earningsSurprise", operator: ">", value: 0, period: "MRQ" },
      { id: "eps-revision", metric: "nextFyEpsRevision30d", operator: ">", value: 0, period: "FY1" },
      { id: "margin-trend", metric: "grossMarginYoYChange", operator: ">=", value: 0, period: "MRQ" },
    ],
  }),
  freezeTemplate({
    id: "volume-breakout",
    name: "放量突破",
    description: "以价格突破、流动性与相对成交量识别动量。",
    conditions: [
      { id: "breakout", metric: "priceVs20DayHigh", operator: ">", value: 0, period: "CURRENT" },
      { id: "relative-volume", metric: "relativeVolume", operator: ">=", value: 1.5, period: "CURRENT" },
      { id: "liquidity", metric: "averageDollarVolume20d", operator: ">=", value: 20, period: "CURRENT" },
      { id: "minimum-price", metric: "price", operator: ">=", value: 5, period: "CURRENT" },
    ],
  }),
]);
