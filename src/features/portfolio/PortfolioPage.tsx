import { useEffect, useMemo, useState } from "react";
import { MarketApiClient } from "../market/marketApiClient";
import { PortfolioHealth } from "../monitoring/PortfolioHealth";
import type { ThesisHealthSummary } from "../monitoring/domain";
import type { MonitorStateService } from "../monitoring/monitorApiRepository";
import { evaluatePortfolioAlerts } from "./alertEngine";
import type { LedgerEventType, PortfolioAlert, PortfolioSettings } from "./domain";
import { calculatePortfolio } from "./portfolioAnalytics";
import { PortfolioPerformanceTab } from "./PortfolioPerformanceTab";
import { PortfolioSettingsDialog } from "./PortfolioSettingsDialog";
import type { PerformanceRange, PerformanceViewModel } from "./performance/domain";
import { usePortfolioPerformance } from "./performance/usePortfolioPerformance";
import type { ConfirmedSplitInput } from "./SplitReviewPanel";
import type { PortfolioStateService } from "./portfolioApiRepository";
import type { WeeklyReview } from "./domain";
import "./portfolio.css";
import { useRepositories } from "../../app/repositories";
import { OrderTicket } from "../trading/OrderTicket";
import type { PaperTradingApi } from "../trading/paperTradingApiClient";
import { PaperPortfolioOverview } from "../trading/PaperPortfolioOverview";
import { loadPortfolioSelection, savePortfolioSelection, type PortfolioSelection } from "./portfolioSelection";

const fallbackQuotes = { NVDA: { price: 167.32, previousClose: 162.58 }, AMD: { price: 158.11, previousClose: 153.2 }, MSFT: { price: 505.41, previousClose: 500 } };
const sectors = { NVDA: "半导体", AMD: "半导体", MSFT: "软件" };
const defaultMarketClient = new MarketApiClient();
type PortfolioMarketClient = Pick<MarketApiClient, "getQuotes" | "getUniverse" | "getEvents" | "getBatchBars">;
type PortfolioTab = "overview" | "ledger" | "performance" | "review";

type PortfolioPageProps = { marketClient?: PortfolioMarketClient; portfolioState?: PortfolioStateService; monitorState?: MonitorStateService; tradingApi?: PaperTradingApi };
export function PortfolioPage(props: PortfolioPageProps) {
  const [selection, setSelection] = useState<PortfolioSelection>(() => loadPortfolioSelection(Boolean(props.tradingApi)));
  const select = (value: PortfolioSelection) => { savePortfolioSelection(value); setSelection(value); };
  return <section className="portfolio-page"><div className="portfolio-selector"><button type="button" aria-pressed={selection === "manual"} onClick={() => select("manual")}>手工组合</button>{props.tradingApi && <button type="button" aria-pressed={selection === "alpaca-paper"} onClick={() => select("alpaca-paper")}>Alpaca Paper</button>}</div>{selection === "alpaca-paper" ? <PaperPortfolioOverview tradingApi={props.tradingApi} marketClient={props.marketClient ?? defaultMarketClient} /> : <ManualPortfolioPage {...props} />}</section>;
}

function ManualPortfolioPage({ marketClient = defaultMarketClient, portfolioState: injectedPortfolioState, monitorState: injectedMonitorState, tradingApi }: PortfolioPageProps) {
  const repositories = useRepositories();
  const portfolioState = useMemo(() => injectedPortfolioState ?? repositories.portfolio, [injectedPortfolioState, repositories.portfolio]);
  const monitorState = useMemo(() => injectedMonitorState ?? repositories.monitoring, [injectedMonitorState, repositories.monitoring]);
  const [settings, setSettings] = useState<PortfolioSettings>({ version: 1, initialCash: 10_000, inceptionDate: new Date().toISOString().slice(0,10), benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: new Date(0).toISOString() });
  const [events, setEvents] = useState<import("./domain").LedgerEvent[]>([]);
  const [ignoredSplitIds, setIgnoredSplitIds] = useState<string[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [storedAlerts,setStoredAlerts]=useState<PortfolioAlert[]>([]);
  const [tab, setTab] = useState<PortfolioTab>("overview");
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState<PerformanceRange>({ kind: "inception" });
  const [eventType, setEventType] = useState<LedgerEventType>("buy");
  const [dialog, setDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [symbol, setSymbol] = useState("NVDA");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("167.32");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const reloadPortfolio = useMemo(() => async () => { const bootstrap = await portfolioState.getBootstrap(); setSettings(bootstrap.settings); setEvents(bootstrap.events); setIgnoredSplitIds(bootstrap.ignoredSplits.map((decision) => decision.sourceEventId)); setReviews(bootstrap.reviews); setStoredAlerts(bootstrap.alerts); setVersion(bootstrap.revision); }, [portfolioState]);
  useEffect(() => { void reloadPortfolio().catch(() => setMessage("组合状态暂时不可用")); }, [reloadPortfolio]);
  const symbols = useMemo(() => [...new Set(events.flatMap((event) => event.symbol ? [event.symbol] : []))], [events]);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { price: number; previousClose: number }>>();
  const [quoteProvenance, setQuoteProvenance] = useState<{ source: string; asOf: string; stale: boolean }>();
  useEffect(() => {
    let active = true;
    if (!symbols.length) return () => { active = false; };
    void marketClient.getQuotes(symbols).then((envelope) => {
      if (!active) return;
      setLiveQuotes(Object.fromEntries(envelope.data.filter((quote) => quote.price !== undefined).map((quote) => [quote.symbol, { price: quote.price!, previousClose: quote.previousClose ?? quote.price! }])));
      setQuoteProvenance({ source: envelope.source, asOf: envelope.asOf, stale: envelope.stale });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [marketClient, symbols]);

  const performance = usePortfolioPerformance({ enabled: tab === "performance", client: marketClient, settings, events, ignoredSplitIds, range, revision: version });
  const cachedPerformanceModel = performance.state.status === "loading" || performance.state.status === "error" ? performance.state.cached : undefined;
  const performanceModel: PerformanceViewModel = performance.state.status === "ready" ? performance.state.model : cachedPerformanceModel ?? { pendingSplits: [], notices: performance.state.status === "error" ? [performance.state.message] : performance.state.status === "loading" ? ["正在加载绩效"] : [], dataState: "unavailable", provenance: { source: "alpaca" } };
  const historyValues = performanceModel.result?.points.flatMap((point) => point.totalValue === undefined ? [] : [point.totalValue]) ?? [];
  const quotes = liveQuotes ?? fallbackQuotes;
  const result = useMemo(() => calculatePortfolio({ events, initialCash: settings.initialCash, quotes, sectors, history: historyValues }), [events, historyValues, quotes, settings.initialCash]);
  const performanceDrawdown = performanceModel.result?.summary.currentDrawdown;

  const heldSymbolKey = result.positions.filter((position) => position.quantity > 0).map((position) => position.symbol).sort().join(",");
  const [health, setHealth] = useState<ThesisHealthSummary>();
  const [healthError, setHealthError] = useState("");
  const [healthWarnings, setHealthWarnings] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const heldSymbols = heldSymbolKey ? heldSymbolKey.split(",") : [];
    if (!heldSymbols.length) { setHealth({ items: [], breachedCount: 0, expiringCount: 0, unreadAlertCount: 0 }); setHealthError(""); setHealthWarnings([]); return () => { active = false; }; }
    const now = new Date().toISOString();
    const loadHealth = async () => {
      const alerts = await monitorState.listAlerts({ view: "pending", now });
      const relevant = alerts.filter((alert) => heldSymbols.includes(alert.symbol));
      const thesisVersionIds = [...new Set(relevant.map((alert) => alert.thesisVersionId))];
      const reviewsByThesis = new Map(await Promise.all(thesisVersionIds.map(async (thesisVersionId) => [thesisVersionId, await monitorState.listReviews(thesisVersionId)] as const)));
      const items = heldSymbols.map((heldSymbol) => {
        const matching = relevant.filter((alert) => alert.symbol === heldSymbol);
        const reviewsForSymbol = matching.flatMap((alert) => reviewsByThesis.get(alert.thesisVersionId) ?? []).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const latestReview = reviewsForSymbol.at(-1);
        const concernReviewed = (alert: typeof matching[number]) => (reviewsByThesis.get(alert.thesisVersionId) ?? []).some((review) => review.decision === "reaffirmed" && review.createdAt >= alert.createdAt && review.conditionSnapshot.some((snapshot) => snapshot.conditionId === alert.conditionId && snapshot.conditionVersion === alert.conditionVersion && snapshot.status === alert.toStatus));
        const status = latestReview?.decision === "invalidated" ? "invalidated" as const
          : latestReview?.decision === "archived" ? "archived" as const
            : matching.some((alert) => !concernReviewed(alert)) ? "review-needed" as const : "normal" as const;
        return { symbol: heldSymbol, thesisVersionId: matching[0]?.thesisVersionId, status, breachedCount: matching.filter((alert) => alert.toStatus === "breached").length, expiringCount: matching.filter((alert) => alert.toStatus === "expired").length, unreadAlertCount: matching.filter((alert) => !alert.readAt).length };
      });
      return { summary: { items, breachedCount: items.reduce((sum, item) => sum + item.breachedCount, 0), expiringCount: items.reduce((sum, item) => sum + item.expiringCount, 0), unreadAlertCount: items.reduce((sum, item) => sum + item.unreadAlertCount, 0) }, warnings: [] };
    };
    void loadHealth().then(({ summary, warnings }) => { if (active) { setHealth(summary); setHealthError(""); setHealthWarnings(warnings); } }).catch(() => { if (active) setHealthError("逻辑健康暂时不可用"); });
    return () => { active = false; };
  }, [heldSymbolKey, monitorState]);

  const alerts = useMemo(() => evaluatePortfolioAlerts({ naturalPeriod: "2026-W32", positions: result.positions.map((position) => ({ symbol: position.symbol, weight: position.weight })), sectorExposure: result.sectorExposure, drawdownPercent: performanceDrawdown === undefined ? undefined : performanceDrawdown * 100 }), [performanceDrawdown, result.positions, result.sectorExposure]);
  useEffect(()=>{void portfolioState.reconcileAlerts(alerts).then(items=>setStoredAlerts(items.filter(item=>item.status!=="resolved"))).catch(()=>undefined);},[alerts,portfolioState]);

  const mutate = async (notice: string) => { await reloadPortfolio(); setMessage(notice); };
  const saveEvent = async () => {
    try {
      const occurredAt = `${eventDate}T15:00:00Z`;
      if (eventType === "buy") await portfolioState.append({ type: "buy", symbol, quantity: Number(quantity), price: Number(price), thesisVersionId: "v1", occurredAt });
      if (eventType === "sell") await portfolioState.append({ type: "sell", symbol, quantity: Number(quantity), price: Number(price), reason, occurredAt });
      if (eventType === "dividend") await portfolioState.append({ type: "dividend", symbol, amount: Number(amount), reason: reason || "现金分红", occurredAt });
      if (eventType === "fee") await portfolioState.append({ type: "fee", amount: Number(amount), reason: reason || "模拟费用", occurredAt });
      if (eventType === "deposit") await portfolioState.append({ type: "deposit", amount: Number(amount), reason, occurredAt });
      if (eventType === "withdrawal") await portfolioState.append({ type: "withdrawal", amount: Number(amount), reason, occurredAt });
      setDialog(false);
      await mutate("交易已记录");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  };
  const appendSplit = (input: ConfirmedSplitInput) => { void portfolioState.append({ type: "split", symbol: input.symbol, oldRate: input.oldRate, newRate: input.newRate, quantityMultiplier: input.quantityMultiplier, source: input.source, sourceEventId: input.sourceEventId, confirmedAt: new Date().toISOString(), occurredAt: `${input.effectiveDate}T00:00:00Z` }).then(() => mutate("拆股已写入账本")).catch((error) => setMessage(error instanceof Error ? error.message : "拆股保存失败")); };
  const saveSettings = (input: Omit<PortfolioSettings, "version" | "updatedAt">) => { void portfolioState.saveSettings(input).then(async () => { setSettingsDialog(false); await mutate("组合设置已保存"); }).catch((error) => setMessage(error instanceof Error ? error.message : "设置保存失败")); };
  const saveBenchmark = async (nextSymbol: string) => { const normalized = nextSymbol.trim().toUpperCase(); if (!/^[A-Z0-9.-]+$/.test(normalized)) throw new Error("基准代码格式无效"); const envelope = await marketClient.getBatchBars([normalized], { start: settings.inceptionDate, end: new Date().toISOString().slice(0, 10), adjustment: "all" }); if ((envelope.data.symbols[normalized] ?? []).length < 2) throw new Error("基准没有有效历史日线"); await portfolioState.saveSettings({ ...settings, benchmarkSymbol: normalized, baseCurrency: "USD" }); await mutate(`基准已切换为 ${normalized}`); };
  const submitReview = () => { void portfolioState.submitReview({ week: "2026-W32", snapshot: { asOf: new Date().toISOString(), positions: result.positions, cash: result.cash, totalValue: result.totalValue, cumulativePnl: result.cumulativePnl, drawdownPercent: performanceDrawdown === undefined ? undefined : performanceDrawdown * 100, sectorExposure: result.sectorExposure, quoteSource: quoteProvenance?.source, quoteAsOf: quoteProvenance?.asOf, quoteStale: quoteProvenance?.stale }, events, alerts: storedAlerts, judgment: "按计划执行", action: "本周无操作", result: "组合复盘已生成", nextObservations: ["NVDA 财报"] }).then((review) => mutate(`2026-W32 · 版本 ${review.version}`)).catch(()=>setMessage("周报保存失败")); };

  return <section className="portfolio-page"><h1>模拟组合</h1><div role="tablist" aria-label="组合功能"><button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>组合总览</button><button role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>持仓与交易</button><button role="tab" aria-selected={tab === "performance"} onClick={() => setTab("performance")}>绩效分析</button><button role="tab" aria-selected={tab === "review"} onClick={() => setTab("review")}>复盘中心</button></div>
    {tradingApi && <OrderTicket symbol={symbol} api={tradingApi} />}
    {tab === "overview" && <section><div className="portfolio-metrics"><p>总资产<br /><strong>{result.totalValue === undefined ? "估值不可用" : result.totalValue.toFixed(2)}</strong></p><p>现金<br /><strong>{result.cash.toFixed(2)}</strong></p><p>最大回撤<br /><strong>{performanceDrawdown === undefined ? "—" : `${(performanceDrawdown * 100).toFixed(2)}%`}</strong></p><p>前五大持仓集中度<br /><strong>{result.topFiveConcentration === undefined ? "估值不可用" : `${result.topFiveConcentration.toFixed(2)}%`}</strong></p></div><table aria-label="行业暴露"><thead><tr><th>行业</th><th>暴露</th></tr></thead><tbody>{Object.entries(result.sectorExposure).map(([sector, exposure]) => <tr key={sector}><th>{sector}</th><td>{exposure.toFixed(2)}%</td></tr>)}</tbody></table>{healthWarnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{healthWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}{healthError ? <section className="portfolio-health"><h2>投资逻辑健康</h2><p role="alert">{healthError}</p></section> : health && <PortfolioHealth summary={health} />}</section>}
    {tab === "ledger" && <section><button type="button" onClick={() => setDialog(true)}>记录交易</button><table><thead><tr><th>代码</th><th>数量</th><th>成本</th><th>市值</th><th>盈亏</th></tr></thead><tbody>{result.positions.map((position) => <tr key={position.symbol}><th>{position.symbol}</th><td>{position.quantity}</td><td>{position.averageCost.toFixed(2)}</td><td>{position.marketValue?.toFixed(2) ?? "估值不可用"}</td><td>{position.unrealizedPnl?.toFixed(2) ?? "估值不可用"}</td></tr>)}</tbody></table>{!result.positions.length && <p>尚无模拟持仓</p>}</section>}
    {tab === "performance" && <PortfolioPerformanceTab model={performanceModel} range={range} benchmark={settings.benchmarkSymbol} quantities={Object.fromEntries(result.positions.map((position) => [position.symbol, position.quantity]))} onRangeChange={setRange} onBenchmarkSave={saveBenchmark} onRefresh={performance.refresh} onConfigure={() => setSettingsDialog(true)} onConfirmSplit={appendSplit} onIgnoreSplit={(candidate, note) => { void portfolioState.ignoreSplit({ sourceEventId: candidate.id, symbol: candidate.symbol!, note, ignoredAt: new Date().toISOString() }).then(() => mutate("拆股候选已忽略")).catch(()=>setMessage("拆股决定保存失败")); }} onManualSplit={appendSplit} />}
    {tab === "review" && <section><h2>待处理提醒</h2>{storedAlerts.length ? storedAlerts.map((alert) => <article key={alert.id}><strong>{alert.message}</strong><p>{alert.severity} · 当前值 {alert.currentValue}% · 阈值 {alert.threshold}%</p><button type="button" onClick={() => { void portfolioState.actAlert(alert.id,{type:"acknowledge"}).then(()=>mutate("提醒已确认")); }}>确认 {alert.message}</button><button type="button" onClick={() => setSnoozeId(alert.id)}>暂缓 {alert.message}</button><button type="button" onClick={() => { void portfolioState.actAlert(alert.id,{type:"resolve"}).then(reloadPortfolio); }}>关闭 {alert.message}</button>{snoozeId === alert.id && <span><label>恢复日期<input aria-label="恢复日期" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} /></label><button type="button" onClick={() => { if (!snoozeUntil) { setMessage("请选择恢复日期"); return; } void portfolioState.actAlert(alert.id,{type:"snooze",until:`${snoozeUntil}T00:00:00Z`}).then(()=>{setMessage(`已暂缓至 ${snoozeUntil}`);setSnoozeId(null);return reloadPortfolio();}); }}>确认暂缓</button></span>}</article>) : <p>当前没有待处理风险</p>}<button type="button" onClick={submitReview}>提交周报</button><ReviewHistory reviews={reviews} /></section>}
    {dialog && <div role="dialog" aria-label="记录交易"><label>事件类型<select aria-label="事件类型" value={eventType} onChange={(event) => setEventType(event.target.value as LedgerEventType)}><option value="buy">买入</option><option value="sell">卖出</option><option value="dividend">分红</option><option value="fee">费用</option><option value="deposit">入金</option><option value="withdrawal">出金</option></select></label><label>发生日期<input aria-label="发生日期" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>{(eventType === "buy" || eventType === "sell" || eventType === "dividend") && <label>代码<input aria-label="代码" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>}{(eventType === "buy" || eventType === "sell") && <><label>数量<input aria-label="数量" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>价格<input aria-label="价格" value={price} onChange={(event) => setPrice(event.target.value)} /></label></>}{(eventType === "dividend" || eventType === "fee" || eventType === "deposit" || eventType === "withdrawal") && <label>金额<input aria-label="金额" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}<label>调整原因<input aria-label="调整原因" value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" onClick={saveEvent}>确认记录</button><button type="button" onClick={() => setDialog(false)}>取消</button></div>}
    {settingsDialog && <PortfolioSettingsDialog settings={settings} hasEvents={events.length > 0} onSave={saveSettings} onClose={() => setSettingsDialog(false)} />}
    <p role="status">{message}</p>{(message.includes("可卖") || message.includes("可用现金")) && <p role="alert">{message}</p>}
  </section>;
}

export function JournalPage({ portfolioState: injectedPortfolioState }: { portfolioState?: PortfolioStateService } = {}) { const repositories=useRepositories();const portfolioState=injectedPortfolioState??repositories.portfolio;const [reviews,setReviews]=useState<WeeklyReview[]>([]);useEffect(()=>{void portfolioState.getBootstrap().then(data=>setReviews(data.reviews)).catch(()=>undefined);},[portfolioState]);return <section className="portfolio-page"><h1>日志</h1><ReviewHistory reviews={reviews}/></section>; }
function ReviewHistory({reviews}:{reviews:WeeklyReview[]}) { return <section><h2>历史周报</h2>{reviews.length ? reviews.map((review) => <p key={review.id}>{review.week} · 版本 {review.version}</p>) : <p>尚无周报</p>}</section>; }
