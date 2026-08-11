import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketApiClient } from "../market/marketApiClient";
import { PortfolioPerformanceTab } from "../portfolio/PortfolioPerformanceTab";
import type { PortfolioSettings } from "../portfolio/domain";
import { adaptBrokerPerformance, type BrokerPerformanceAdaptation } from "../portfolio/performance/brokerPerformanceAdapter";
import type { PerformanceRange, PerformanceViewModel } from "../portfolio/performance/domain";
import { usePortfolioPerformance } from "../portfolio/performance/usePortfolioPerformance";
import type { PaperPortfolioApi } from "./paperPortfolioApiClient";

type PerformanceMarketClient = Pick<MarketApiClient, "getBatchBars" | "getEvents">;
type LedgerState = { status: "loading" } | { status: "ready"; adaptation: BrokerPerformanceAdaptation } | { status: "error" };
const defaultMarketClient = new MarketApiClient();

export function PaperPortfolioPerformance({ api, marketClient = defaultMarketClient, activeDrift }: { api: PaperPortfolioApi; marketClient?: PerformanceMarketClient; activeDrift: boolean }) {
  const [state, setState] = useState<LedgerState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => adaptBrokerPerformance({ activeDrift: false, events: await api.listLedger() }), [api]);

  useEffect(() => {
    if (activeDrift) return;
    let active = true;
    setState({ status: "loading" });
    void load().then((adaptation) => { if (active) setState({ status: "ready", adaptation }); })
      .catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; };
  }, [activeDrift, load]);

  if (activeDrift) return <p role="alert">Paper 对账不一致，绩效暂不可用</p>;
  if (state.status === "loading") return <p role="status">正在加载 Paper 绩效</p>;
  if (state.status === "error") return <p role="alert">Paper 账本加载失败</p>;
  if (!state.adaptation.events.length) return <section><p>暂无 Paper 成交与现金活动</p>{state.adaptation.notices.map((notice) => <p key={notice}>{notice}</p>)}</section>;
  if (!state.adaptation.cashHistoryComplete) return <p role="alert">Paper 现金历史不足，请先完成全量活动对账</p>;

  const refresh = async () => {
    try {
      const adaptation = await load();
      setState({ status: "ready", adaptation });
      setRevision((value) => value + 1);
    } catch {
      setState({ status: "error" });
    }
  };
  return <ReadyPaperPerformance adaptation={state.adaptation} marketClient={marketClient} revision={revision} onRefresh={refresh} />;
}

function ReadyPaperPerformance({ adaptation, marketClient, revision, onRefresh }: { adaptation: BrokerPerformanceAdaptation; marketClient: PerformanceMarketClient; revision: number; onRefresh: () => Promise<void> }) {
  const [range, setRange] = useState<PerformanceRange>({ kind: "inception" });
  const settings = useMemo<PortfolioSettings>(() => ({
    version: 1,
    initialCash: 0,
    inceptionDate: adaptation.inceptionDate!,
    benchmarkSymbol: "SPY",
    baseCurrency: "USD",
    updatedAt: adaptation.events.at(-1)?.occurredAt ?? new Date(0).toISOString(),
  }), [adaptation.events, adaptation.inceptionDate]);
  const performance = usePortfolioPerformance({ enabled: true, client: marketClient, settings, events: adaptation.events, ignoredSplitIds: [], range, revision, recoveryNotice: adaptation.notices.join("；") || undefined });
  const cached = performance.state.status === "loading" || performance.state.status === "error" ? performance.state.cached : undefined;
  const model: PerformanceViewModel = performance.state.status === "ready"
    ? performance.state.model
    : cached ?? { pendingSplits: [], notices: [performance.state.status === "error" ? performance.state.message : "正在加载绩效"], dataState: "unavailable", provenance: { source: "alpaca" } };

  return <PortfolioPerformanceTab model={model} range={range} benchmark="SPY" mode="paper-readonly" onRangeChange={setRange} onRefresh={() => void onRefresh()} />;
}
