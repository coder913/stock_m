import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Signal, TodayDashboard } from "../market/domain";
import { MarketApiClient } from "../market/marketApiClient";
import type { DataEnvelope, MarketEvent, MarketQuote } from "../market/apiDomain";
import "./today.css";
import { todayEditorial } from "./todayEditorial";
import { ReviewQueue } from "../monitoring/ReviewQueue";
import type { MonitorAlert } from "../monitoring/domain";
import type { MonitorStateService } from "../monitoring/monitorApiRepository";
import { useRepositories } from "../../app/repositories";

const freshnessLabel = (minutes: number) => `延迟 ${minutes} 分钟`;
const defaultMarketClient = new MarketApiClient();
const currentTime = () => new Date().toISOString();
type TodayMarketClient = Pick<MarketApiClient, "getQuotes" | "getEvents" | "getUniverse" | "refresh">;

export function TodayPage({ marketClient = defaultMarketClient, monitorState: injectedMonitorState, now = currentTime }: { marketClient?: TodayMarketClient; monitorState?: MonitorStateService; now?: () => string }) {
  const [data] = useState<TodayDashboard>(todayEditorial); const [selectedSymbol, setSelectedSymbol] = useState("NVDA"); const [liveQuotes, setLiveQuotes] = useState<DataEnvelope<MarketQuote[]> | null>(null); const [events, setEvents] = useState<MarketEvent[]>([]); const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlert[]>([]); const [monitorError, setMonitorError] = useState(""); const [monitorWarnings, setMonitorWarnings] = useState<string[]>([]);
  const repositories = useRepositories();
  const monitorState = useMemo(() => injectedMonitorState ?? repositories.monitoring, [injectedMonitorState, repositories.monitoring]);
  const loadQuotes = useCallback(() => marketClient.getQuotes(["SPY", "QQQ", "DIA", "IWM"]).then(setLiveQuotes).catch(() => undefined), [marketClient]);
  const reloadAlerts = useCallback(async () => { setMonitorAlerts(await monitorState.listAlerts({ view: "pending", now: now() })); }, [monitorState, now]);
  useEffect(() => { void loadQuotes(); }, [loadQuotes]);
  useEffect(() => { if (typeof marketClient.getEvents === "function") void marketClient.getEvents({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }).then((result) => setEvents(result.data)).catch(() => undefined); }, [marketClient]);
  useEffect(() => { let active = true; void reloadAlerts().catch(() => { if (active) setMonitorError("投资逻辑监控暂时不可用"); }); return () => { active = false; }; }, [reloadAlerts]);
  const selected = data.signals.find((signal) => signal.symbol === selectedSymbol) ?? data.signals[0]; const delayed = data.freshness.kind === "delayed" ? freshnessLabel(data.freshness.minutes) : "模拟数据";
  const runAction = async (id: string, action: "read" | "archive" | "snooze", until?: string) => { await monitorState.act(id, action === "snooze" ? { type: action, until: until! } : { type: action }); await reloadAlerts(); };
  return <div className="today-page">
    <button type="button" onClick={() => { void marketClient.refresh({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] }).then(async () => { await loadQuotes(); await reloadAlerts(); }); }}>刷新市场数据</button><button type="button" onClick={() => { void monitorState.requestRun().then(reloadAlerts).then(() => setMonitorError("")).catch(() => setMonitorError("投资逻辑监控暂时不可用")); }}>刷新监控</button>
    <p className="freshness">{delayed}</p><section className="market-pulse" aria-label="市场脉冲">{(liveQuotes?.data.length ? liveQuotes.data : data.pulses).map((pulse) => <div key={pulse.symbol}><strong>{pulse.symbol}</strong><span>{pulse.price}</span></div>)}</section>
    <section className="today-review" aria-labelledby="today-review-title"><h2 id="today-review-title">需要复核</h2>{monitorError && <p role="alert">{monitorError}</p>}{monitorWarnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{monitorWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}<ReviewQueue alerts={monitorAlerts} now={now()} onRead={(id) => { void runAction(id, "read"); }} onSnooze={(id, until) => { void runAction(id, "snooze", until); }} onArchive={(id) => { void runAction(id, "archive"); }} /></section>
    <div className="today-grid"><section><h1>今天值得关注</h1><div className="signal-list">{data.signals.map((signal) => <button key={signal.symbol} type="button" aria-pressed={signal.symbol === selected.symbol} onClick={() => setSelectedSymbol(signal.symbol)} aria-label={`查看 ${signal.symbol}`}><strong>{signal.symbol}</strong><span>{signal.trigger}</span></button>)}</div><SignalDetail signal={selected} /></section><aside><h2>本周事件</h2>{events.length ? events.map((event) => <p key={event.id}>{event.scheduledAt} · {event.type} · {event.title}</p>) : data.weekEvents.map((event) => <p key={event.symbol}>{event.date} · {event.session} · {event.symbol}</p>)}<h2>投资逻辑检查</h2>{Object.entries(data.thesisCheck).filter(([key]) => key !== "symbol").map(([key, value]) => <p key={key}>{value}</p>)}</aside></div>
  </div>;
}
function SignalDetail({ signal }: { signal: Signal }) { return <article className="signal-detail"><h2>{signal.symbol} · {signal.name}</h2><p>{signal.trigger}</p><ul>{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link to={`/stocks/${signal.symbol}`}>研究 {signal.symbol}</Link></article>; }
