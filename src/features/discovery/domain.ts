import type { SavedScreen, ScreenerCondition, ScreenerMetric, ScreenerOperator, ScreenerPeriod } from "../../../shared/discoveryState";
export type { SavedScreen, ScreenerCondition, ScreenerMetric, ScreenerOperator, ScreenerPeriod } from "../../../shared/discoveryState";

export interface StockMetrics {
  price: number;
  dailyChangePercent: number;
  revenueGrowthYoY: number;
  epsGrowthYoY: number;
  grossMarginVsIndustryMedian: number;
  freeCashFlow: number;
  forwardPE: number;
  forwardPEToIndustryMedian: number;
  peg: number;
  freeCashFlowYield: number;
  netDebtToEbitda: number;
  earningsSurprise: number;
  nextFyEpsRevision30d: number;
  grossMarginYoYChange: number;
  priceVs20DayHigh: number;
  relativeVolume: number;
  averageDollarVolume20d: number;
  marketCap: number;
  operatingMargin: number;
  return3Months: number;
  beta: number;
}

export interface ScreenerTemplate {
  id: string;
  name: string;
  description: string;
  conditions: readonly ScreenerCondition[];
}

export interface StockSnapshot {
  symbol: string;
  name: string;
  industry: string;
  metrics: Partial<StockMetrics>;
  nextEvent?: CompanyEvent;
}

export interface CompanyEvent {
  id: string;
  symbol?: string;
  date: string;
  type: "earnings" | "dividend" | "split" | "company" | "macro" | "corporate-action";
  title: string;
  status: "expected" | "confirmed";
  source: string;
}

export interface MetricDefinition {
  metric: ScreenerMetric;
  label: string;
  unit: "%" | "USD" | "USDm" | "ratio";
  defaultPeriod: ScreenerPeriod;
}

export interface ScreenValidationError {
  conditionId: string;
  code: "invalid-value" | "invalid-range" | "conflict";
  message: string;
}

export interface MarketTheme {
  id: string;
  name: string;
  kind: "industry" | "theme";
  marketCapWeight: number;
  changePercent: number;
  valuationDeviation: number;
}
