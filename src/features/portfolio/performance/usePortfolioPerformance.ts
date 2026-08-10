import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketApiClient } from "../../market/marketApiClient";
import type { LedgerEvent, PortfolioSettings } from "../domain";
import { calculateAttribution } from "./performanceAttribution";
import { PerformanceCacheRepository } from "./performanceCacheRepository";
import { PerformanceHistoryLoader } from "./performanceHistoryLoader";
import { calculatePerformance } from "./portfolioPerformanceEngine";
import type { PerformanceRange, PerformanceViewModel } from "./domain";

export type PerformanceViewState =
  | { status: "idle" }
  | { status: "loading"; cached?: PerformanceViewModel }
  | { status: "ready"; model: PerformanceViewModel }
  | { status: "error"; cached?: PerformanceViewModel; message: string };

const dateBefore = (to: string, years: number, months: number): string => {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
};

export const resolvePerformanceRange = (range: PerformanceRange, settings: PortfolioSettings, to: string) => {
  if (range.kind === "custom") return range;
  if (range.kind === "inception") return { from: settings.inceptionDate, to };
  if (range.kind === "ytd") return { from: `${to.slice(0, 4)}-01-01`, to };
  if (range.kind === "1y") return { from: dateBefore(to, 1, 0), to };
  if (range.kind === "6m") return { from: dateBefore(to, 0, 6), to };
  return { from: dateBefore(to, 0, 3), to };
};

export function usePortfolioPerformance(input: { enabled: boolean; client: Pick<MarketApiClient, "getBatchBars" | "getEvents">; settings: PortfolioSettings; events: LedgerEvent[]; ignoredSplitIds: string[]; range: PerformanceRange; revision: number; recoveryNotice?: string }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<PerformanceViewState>({ status: "idle" });
  const cache = useMemo(() => new PerformanceCacheRepository(localStorage), []);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  useEffect(() => {
    if (!input.enabled) return;
    let active = true;
    setState({ status: "loading" });
    const to = new Date().toISOString().slice(0, 10);
    const selected = resolvePerformanceRange(input.range, input.settings, to);
    const loader = new PerformanceHistoryLoader(input.client);
    void loader.load({ settings: input.settings, events: input.events, ignoredSplitIds: input.ignoredSplitIds, to: selected.to }).then((history) => {
      if (!active) return;
      const result = calculatePerformance({ history, from: selected.from, to: selected.to });
      const validInternals = result.dailyInternals.filter((day) => day.marketDate >= (result.summary.availableFrom ?? "9999-12-31") && day.endingValue !== undefined);
      const attribution = validInternals.length ? calculateAttribution({ ...result, dailyInternals: validInternals }) : undefined;
      const model: PerformanceViewModel = {
        result,
        attribution,
        pendingSplits: history.pendingSplits,
        notices: [...new Set([...(input.recoveryNotice ? [input.recoveryNotice] : []), ...history.notices, ...result.warnings])],
        dataState: history.dataState,
        provenance: { source: "alpaca", asOf: history.sourceAsOf.holdings, availableFrom: result.summary.availableFrom },
      };
      const cacheKey = cache.key({ settings: input.settings, events: input.events, holdingsAsOf: history.sourceAsOf.holdings, benchmarkAsOf: history.sourceAsOf.benchmark, range: input.range, benchmark: input.settings.benchmarkSymbol, algorithmVersion: "1" });
      cache.put(cacheKey, result);
      setState({ status: "ready", model });
    }).catch((error) => {
      if (active) setState({ status: "error", message: error instanceof Error ? error.message : "绩效加载失败" });
    });
    return () => { active = false; };
  }, [cache, input.client, input.enabled, input.events, input.ignoredSplitIds, input.range, input.recoveryNotice, input.revision, input.settings, refreshToken]);
  return { state, refresh };
}
