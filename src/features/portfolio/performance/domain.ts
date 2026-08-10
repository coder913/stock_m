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

export interface CacheablePerformanceResult {
  points: unknown[];
  [key: string]: unknown;
}
