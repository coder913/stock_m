import type { MarketEvent, PriceBar } from "../../market/apiDomain";
import type { LedgerEvent, PortfolioSettings } from "../domain";

export type PerformanceResourceState = "fresh" | "stale" | "unavailable";

export interface PerformanceHistoryLoad {
  settings: PortfolioSettings;
  events: LedgerEvent[];
  holdingBars: Record<string, PriceBar[]>;
  benchmarkBars: PriceBar[];
  pendingSplits: MarketEvent[];
  notices: string[];
  sourceAsOf: { holdings?: string; benchmark?: string; events?: string };
  resourceStates: {
    holdings: PerformanceResourceState;
    benchmark: PerformanceResourceState;
    events: PerformanceResourceState;
  };
  dataState: PerformanceResourceState;
}

export interface PerformanceCacheKeyInput {
  settings: PortfolioSettings;
  events: LedgerEvent[];
  holdingsAsOf?: string;
  benchmarkAsOf?: string;
  range: unknown;
  benchmark: string;
  algorithmVersion: string;
}

export interface PerformanceInput {
  history: PerformanceHistoryLoad;
  from: string;
  to: string;
}

export interface DailyPortfolioPoint {
  marketDate: string;
  valuedAt: string;
  cash: number;
  holdingsValue?: number;
  totalValue?: number;
  externalFlow: number;
  dailyReturn?: number;
  cumulativeTwr?: number;
  normalizedPortfolio?: number;
  benchmarkValue?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  drawdown?: number;
  dataState: PerformanceResourceState;
  missingSymbols: string[];
}

export interface DailyPositionInternal {
  quantity: number;
  cost: number;
  realizedPnl: number;
  beginningMarketValue: number;
  endingMarketValue?: number;
  buyCashPaid: number;
  sellCashReceived: number;
  realizedPnlChange: number;
  dividends: number;
}

export interface DailyPerformanceInternal {
  marketDate: string;
  valuedAt: string;
  beginningValue?: number;
  endingValue?: number;
  deposits: number;
  withdrawals: number;
  externalFlow: number;
  fees: number;
  modifiedDietzDenominator?: number;
  dailyReturn?: number;
  positions: Record<string, DailyPositionInternal>;
  dataState: PerformanceResourceState;
}

export interface PerformanceSummary {
  from: string;
  to: string;
  availableFrom?: string;
  twr?: number;
  mwr?: number;
  annualizedReturn?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  currentDrawdown?: number;
  maximumDrawdown?: number;
  positiveDayRate?: number;
}

export interface PerformanceResult {
  points: DailyPortfolioPoint[];
  summary: PerformanceSummary;
  dailyInternals: DailyPerformanceInternal[];
  interval: { beginningValue: number; endingValue: number; deposits: number; withdrawals: number };
  warnings: string[];
  [key: string]: unknown;
}

export type CacheablePerformanceResult = PerformanceResult | ({ points: unknown[] } & Record<string, unknown>);
