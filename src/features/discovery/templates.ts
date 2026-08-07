import type { MetricDefinition, ScreenerTemplate } from "./domain";

export const metricDefinitions: readonly MetricDefinition[] = Object.freeze([
  { metric: "price", label: "价格", unit: "USD", defaultPeriod: "CURRENT" },
  { metric: "revenueGrowthYoY", label: "营收同比增长", unit: "%", defaultPeriod: "TTM" },
  { metric: "operatingMargin", label: "营业利润率", unit: "%", defaultPeriod: "TTM" },
  { metric: "freeCashFlow", label: "自由现金流", unit: "USDm", defaultPeriod: "TTM" },
  { metric: "freeCashFlowYield", label: "自由现金流收益率", unit: "%", defaultPeriod: "TTM" },
  { metric: "netDebtToEbitda", label: "净负债/EBITDA", unit: "ratio", defaultPeriod: "TTM" },
  { metric: "earningsSurprise", label: "最近季度超预期", unit: "%", defaultPeriod: "MRQ" },
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
    description: "用营收增长、营业利润率和自由现金流识别高质量成长公司。",
    conditions: [
      { id: "revenue-growth", metric: "revenueGrowthYoY", operator: ">=", value: 10, period: "TTM" },
      { id: "operating-margin", metric: "operatingMargin", operator: ">=", value: 15, period: "TTM" },
      { id: "free-cash-flow", metric: "freeCashFlow", operator: ">", value: 0, period: "TTM" },
    ],
  }),
  freezeTemplate({
    id: "cashflow-value",
    name: "现金流价值",
    description: "用自由现金流收益率和净负债约束寻找估值与财务质量兼顾的公司。",
    conditions: [
      { id: "fcf-yield", metric: "freeCashFlowYield", operator: ">=", value: 2, period: "TTM" },
      { id: "leverage", metric: "netDebtToEbitda", operator: "<=", value: 3, period: "TTM" },
    ],
  }),
  freezeTemplate({
    id: "earnings-improvement",
    name: "财报改善",
    description: "关注营收增长、毛利率改善和最近季度业绩超预期。",
    conditions: [
      { id: "revenue-growth", metric: "revenueGrowthYoY", operator: ">", value: 0, period: "TTM" },
      { id: "margin-trend", metric: "grossMarginYoYChange", operator: ">", value: 0, period: "MRQ" },
      { id: "surprise", metric: "earningsSurprise", operator: ">=", value: 0, period: "MRQ" },
    ],
  }),
  freezeTemplate({
    id: "volume-breakout",
    name: "放量突破",
    description: "用接近阶段高点、相对成交量和平均成交额识别流动性充足的突破候选。",
    conditions: [
      { id: "breakout", metric: "priceVs20DayHigh", operator: ">=", value: -3, period: "CURRENT" },
      { id: "relative-volume", metric: "relativeVolume", operator: ">=", value: 1.5, period: "CURRENT" },
      { id: "liquidity", metric: "averageDollarVolume20d", operator: ">=", value: 50, period: "CURRENT" },
    ],
  }),
]);
