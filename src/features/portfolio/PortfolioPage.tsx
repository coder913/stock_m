import { useEffect, useMemo, useState } from "react";
import { AlertRepository } from "./alertRepository";
import { evaluatePortfolioAlerts } from "./alertEngine";
import { calculatePortfolio } from "./portfolioAnalytics";
import { PortfolioLedger } from "./portfolioLedger";
import { ReviewRepository } from "./reviewRepository";
import type { LedgerEventType } from "./domain";
import { MarketApiClient } from "../market/marketApiClient";
import { PortfolioHealth } from "../monitoring/PortfolioHealth";
import type { ThesisHealthSummary } from "../monitoring/domain";
import { ConditionRepository } from "../monitoring/conditionRepository";
import { EvaluationRepository } from "../monitoring/evaluationRepository";
import { MonitorAlertRepository } from "../monitoring/monitorAlertRepository";
import { MonitorSnapshotLoader } from "../monitoring/monitorSnapshotLoader";
import { ThesisMonitorService } from "../monitoring/thesisMonitorService";
import { ThesisReviewRepository } from "../monitoring/thesisReviewRepository";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import "./portfolio.css";

const fallbackQuotes = { NVDA: { price: 167.32, previousClose: 162.58 }, AMD: { price: 158.11, previousClose: 153.2 }, MSFT: { price: 505.41, previousClose: 500 } };
const sectors = { NVDA: "半导体", AMD: "半导体", MSFT: "软件" };
const defaultMarketClient = new MarketApiClient();
type PortfolioMarketClient = Pick<MarketApiClient, "getQuotes" | "getUniverse" | "getEvents">;
type PortfolioMonitorService = Pick<ThesisMonitorService, "evaluate" | "getHealth">;

export function PortfolioPage({ marketClient = defaultMarketClient, monitorService }: { marketClient?: PortfolioMarketClient; monitorService?: PortfolioMonitorService }) {
  const ledger = useMemo(() => new PortfolioLedger(localStorage), []);
  const alertRepository = useMemo(() => new AlertRepository(localStorage), []);
  const [tab, setTab] = useState<"overview" | "ledger" | "review">("overview");
  const [version, setVersion] = useState(0);
  const [eventType, setEventType] = useState<LedgerEventType>("buy");
  const [dialog, setDialog] = useState(false);
  const [symbol, setSymbol] = useState("NVDA"); const [quantity, setQuantity] = useState("1"); const [price, setPrice] = useState("167.32"); const [amount, setAmount] = useState("1"); const [reason, setReason] = useState(""); const [message, setMessage] = useState("");
  const [snoozeId, setSnoozeId] = useState<string | null>(null); const [snoozeUntil, setSnoozeUntil] = useState("");
  const events = ledger.list();
  const symbols = useMemo(() => [...new Set(events.flatMap((event) => event.symbol ? [event.symbol] : []))], [version]);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { price: number; previousClose: number }> | undefined>();
  const [quoteProvenance, setQuoteProvenance] = useState<{ source: string; asOf: string; stale: boolean }>();
  useEffect(() => { if (symbols.length) void marketClient.getQuotes(symbols).then((envelope) => { setLiveQuotes(Object.fromEntries(envelope.data.filter((quote) => quote.price !== undefined).map((quote) => [quote.symbol, { price: quote.price!, previousClose: quote.previousClose ?? quote.price! }]))); setQuoteProvenance({ source: envelope.source, asOf: envelope.asOf, stale: envelope.stale }); }).catch(() => undefined); }, [marketClient, symbols]);
  const quotes = liveQuotes ?? fallbackQuotes;
  const result = useMemo(() => calculatePortfolio({ events, initialCash: 10_000, quotes, sectors, history: [10_000, 10_500, 10_200] }), [events, quotes, version]);
  const service = useMemo(() => monitorService ?? (() => { const conditionRepository = new ConditionRepository(localStorage); const reviewRepository = new ThesisReviewRepository(localStorage); return new ThesisMonitorService({ conditionRepository, evaluationRepository: new EvaluationRepository(localStorage), alertRepository: new MonitorAlertRepository(localStorage), reviewRepository, thesisRepository: new LocalThesisRepository(localStorage), snapshotLoader: new MonitorSnapshotLoader(marketClient) }); })(), [monitorService, marketClient]);
  const heldSymbolKey = result.positions.filter((position) => position.quantity > 0).map((position) => position.symbol).sort().join(",");
  const [health, setHealth] = useState<ThesisHealthSummary>();
  const [healthError, setHealthError] = useState("");
  const [healthWarnings, setHealthWarnings] = useState<string[]>([]);
  useEffect(() => { let active = true; const heldSymbols = heldSymbolKey ? heldSymbolKey.split(",") : []; if (!heldSymbols.length) { setHealth({ items: [], breachedCount: 0, expiringCount: 0, unreadAlertCount: 0 }); setHealthError(""); setHealthWarnings([]); return () => { active = false; }; } const now = new Date().toISOString(); void service.evaluate({ symbols: heldSymbols, now }).then((monitorResult) => { if (active) { setHealth(service.getHealth(heldSymbols, now)); setHealthError(""); setHealthWarnings(monitorResult.warnings); } }).catch(() => { if (active) setHealthError("逻辑健康暂时不可用"); }); return () => { active = false; }; }, [service, heldSymbolKey]);
  const alerts = useMemo(() => evaluatePortfolioAlerts({ naturalPeriod: "2026-W32", positions: result.positions.map((position) => ({ symbol: position.symbol, weight: position.weight })), sectorExposure: result.sectorExposure, drawdownPercent: result.drawdown.current }), [result]);
  const storedAlerts = useMemo(() => { alertRepository.reconcile(alerts, new Date().toISOString()); return alertRepository.list().filter((alert) => alert.status !== "resolved"); }, [alertRepository, alerts, version]);
  const save = () => { try { ledger.append(eventType === "buy" ? { type: "buy", symbol, quantity: Number(quantity), price: Number(price), thesisVersionId: "v1", occurredAt: new Date().toISOString() } : eventType === "sell" ? { type: "sell", symbol, quantity: Number(quantity), price: Number(price), reason, occurredAt: new Date().toISOString() } : eventType === "dividend" ? { type: "dividend", symbol, amount: Number(amount), reason: reason || "现金分红", occurredAt: new Date().toISOString() } : { type: "fee", amount: Number(amount), reason: reason || "模拟费用", occurredAt: new Date().toISOString() }); setDialog(false); setVersion((item) => item + 1); setMessage("交易已记录"); } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } };
  const submitReview = () => { const review = new ReviewRepository(localStorage).submit({ week: "2026-W32", snapshot: { asOf: new Date().toISOString(), positions: result.positions, cash: result.cash, totalValue: result.totalValue, cumulativePnl: result.cumulativePnl, drawdownPercent: result.drawdown.current, sectorExposure: result.sectorExposure, quoteSource: quoteProvenance?.source, quoteAsOf: quoteProvenance?.asOf, quoteStale: quoteProvenance?.stale }, events: ledger.list(), alerts: alertRepository.list(), judgment: "按计划执行", action: "本周无操作", result: "组合复盘已生成", nextObservations: ["NVDA 财报"] }); setMessage(`2026-W32 · 版本 ${review.version}`); setVersion((item) => item + 1); };
  return <section className="portfolio-page"><h1>模拟组合</h1><div role="tablist" aria-label="组合功能"><button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>组合总览</button><button role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>持仓与交易</button><button role="tab" aria-selected={tab === "review"} onClick={() => setTab("review")}>复盘中心</button></div>
    {tab === "overview" && <section><div className="portfolio-metrics"><p>总资产<br /><strong>{result.totalValue === undefined ? "估值不可用" : result.totalValue.toFixed(2)}</strong></p><p>现金<br /><strong>{result.cash.toFixed(2)}</strong></p><p>最大回撤<br /><strong>{result.drawdown.maximum.toFixed(2)}%</strong></p><p>前五大持仓集中度<br /><strong>{result.topFiveConcentration?.toFixed(2) ?? "估值不可用"}%</strong></p></div><table aria-label="行业暴露"><thead><tr><th>行业</th><th>暴露</th></tr></thead><tbody>{Object.entries(result.sectorExposure).map(([sector, exposure]) => <tr key={sector}><th>{sector}</th><td>{exposure.toFixed(2)}%</td></tr>)}</tbody></table>{healthWarnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{healthWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}{healthError ? <section className="portfolio-health"><h2>投资逻辑健康</h2><p role="alert">{healthError}</p></section> : health && <PortfolioHealth summary={health} />}</section>}
    {tab === "ledger" && <section><button type="button" onClick={() => setDialog(true)}>记录交易</button><table><thead><tr><th>代码</th><th>数量</th><th>成本</th><th>市值</th><th>盈亏</th></tr></thead><tbody>{result.positions.map((position) => <tr key={position.symbol}><th>{position.symbol}</th><td>{position.quantity}</td><td>{position.averageCost.toFixed(2)}</td><td>{position.marketValue?.toFixed(2) ?? "估值不可用"}</td><td>{position.unrealizedPnl?.toFixed(2) ?? "估值不可用"}</td></tr>)}</tbody></table>{!result.positions.length && <p>尚无模拟持仓</p>}</section>}
    {tab === "review" && <section><h2>待处理提醒</h2>{storedAlerts.length ? storedAlerts.map((alert) => <article key={alert.id}><strong>{alert.message}</strong><p>{alert.severity} · 当前值 {alert.currentValue}% · 阈值 {alert.threshold}%</p><button type="button" onClick={() => { alertRepository.acknowledge(alert.id); setMessage("提醒已确认"); setVersion((item) => item + 1); }}>确认 {alert.message}</button><button type="button" onClick={() => setSnoozeId(alert.id)}>暂缓 {alert.message}</button><button type="button" onClick={() => { alertRepository.resolve(alert.id); setVersion((item) => item + 1); }}>关闭 {alert.message}</button>{snoozeId === alert.id && <span><label>恢复日期<input aria-label="恢复日期" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} /></label><button type="button" onClick={() => { if (!snoozeUntil) { setMessage("请选择恢复日期"); return; } alertRepository.snooze(alert.id, `${snoozeUntil}T00:00:00Z`); setMessage(`已暂缓至 ${snoozeUntil}`); setSnoozeId(null); setVersion((item) => item + 1); }}>确认暂缓</button></span>}</article>) : <p>当前没有待处理风险</p>}<button type="button" onClick={submitReview}>提交周报</button><ReviewHistory /></section>}
    {dialog && <div role="dialog" aria-label="记录交易"><label>事件类型<select aria-label="事件类型" value={eventType} onChange={(event) => setEventType(event.target.value as LedgerEventType)}><option value="buy">买入</option><option value="sell">卖出</option><option value="dividend">分红</option><option value="fee">费用</option></select></label>{eventType !== "fee" && <label>代码<input aria-label="代码" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>}{(eventType === "buy" || eventType === "sell") && <><label>数量<input aria-label="数量" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>价格<input aria-label="价格" value={price} onChange={(event) => setPrice(event.target.value)} /></label></>}{(eventType === "dividend" || eventType === "fee") && <label>金额<input aria-label="金额" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}<label>调整原因<input aria-label="调整原因" value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" onClick={save}>确认记录</button><button type="button" onClick={() => setDialog(false)}>取消</button></div>}<p role="status">{message}</p>{message.includes("可卖") && <p role="alert">{message}</p>}
  </section>;
}

export function JournalPage() { return <section className="portfolio-page"><h1>日志</h1><ReviewHistory /></section>; }
function ReviewHistory() { const reviews = new ReviewRepository(localStorage).list(); return <section><h2>历史周报</h2>{reviews.length ? reviews.map((review) => <p key={review.id}>{review.week} · 版本 {review.version}</p>) : <p>尚无周报</p>}</section>; }
