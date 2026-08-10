import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Signal, TodayDashboard } from "../market/domain";
import { MarketApiClient } from "../market/marketApiClient";
import type { DataEnvelope, MarketEvent, MarketQuote } from "../market/apiDomain";
import "./today.css";
import { todayEditorial } from "./todayEditorial";
import { ReviewQueue } from "../monitoring/ReviewQueue";
import type { ThesisMonitorService } from "../monitoring/thesisMonitorService";
import type { MonitorAlert } from "../monitoring/domain";
import { MonitorApiRepository, type MonitorStateService } from "../monitoring/monitorApiRepository";

const freshnessLabel = (minutes: number) => `延迟 ${minutes} 分钟`;
const defaultMarketClient = new MarketApiClient();
const currentTime = () => new Date().toISOString();
type TodayMarketClient = Pick<MarketApiClient, "getQuotes" | "getEvents" | "getUniverse" | "refresh">;
type MonitorRunner = Pick<ThesisMonitorService, "evaluate">;
type LegacyAlertRepository = { restoreDue(now: string): void; list(query: { view: "pending"; now: string }): MonitorAlert[]; markRead(id: string, now: string): unknown; snooze(id: string, until: string): unknown; archive(id: string, now: string): unknown };

export function TodayPage({ marketClient = defaultMarketClient, monitorService, monitorState: injectedMonitorState, monitorAlertRepository, now = currentTime }: { marketClient?: TodayMarketClient; monitorService?: MonitorRunner; monitorState?: MonitorStateService; monitorAlertRepository?: LegacyAlertRepository; now?: () => string }) {
  const [data] = useState<TodayDashboard>(todayEditorial); const [selectedSymbol, setSelectedSymbol] = useState("NVDA"); const [liveQuotes, setLiveQuotes] = useState<DataEnvelope<MarketQuote[]> | null>(null); const [events, setEvents] = useState<MarketEvent[]>([]); const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlert[]>([]); const [monitorError, setMonitorError] = useState(""); const [monitorWarnings, setMonitorWarnings] = useState<string[]>([]);
  const monitorState = useMemo(() => injectedMonitorState ?? new MonitorApiRepository(), [injectedMonitorState]);
  const loadQuotes = useCallback(() => marketClient.getQuotes(["SPY", "QQQ", "DIA", "IWM"]).then(setLiveQuotes).catch(() => undefined), [marketClient]);
  const reloadAlerts = useCallback(async () => { const time = now(); if (monitorAlertRepository) { monitorAlertRepository.restoreDue(time); setMonitorAlerts(monitorAlertRepository.list({ view: "pending", now: time })); return; } setMonitorAlerts(await monitorState.listAlerts({ view: "pending", now: time })); }, [monitorAlertRepository, monitorState, now]);
  useEffect(() => { void loadQuotes(); }, [loadQuotes]);
  useEffect(() => { if (typeof marketClient.getEvents === "function") void marketClient.getEvents({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }).then((result) => setEvents(result.data)).catch(() => undefined); }, [marketClient]);
  useEffect(() => { let active = true; void reloadAlerts().catch(() => { if (active) setMonitorError("投资逻辑监控暂时不可用"); }); if (monitorService) void monitorService.evaluate({ now: now() }).then((result) => { if (active) { setMonitorError(""); setMonitorWarnings(result.warnings); void reloadAlerts(); } }).catch(() => { if (active) setMonitorError("投资逻辑监控暂时不可用"); }); return () => { active = false; }; }, [monitorService, reloadAlerts, now]);
  const selected = data.signals.find((signal) => signal.symbol === selectedSymbol) ?? data.signals[0]; const delayed = data.freshness.kind === "delayed" ? freshnessLabel(data.freshness.minutes) : "模拟数据";
  const runAction = async (id: string, action: "read" | "archive" | "snooze", until?: string) => { if (monitorAlertRepository) { if (action === "read") monitorAlertRepository.markRead(id, now()); else if (action === "archive") monitorAlertRepository.archive(id, now()); else monitorAlertRepository.snooze(id, until!); } else { await monitorState.act(id, action === "snooze" ? { type: action, until: until! } : { type: action }); } await reloadAlerts(); };
  return <div className="today-page">
    <button type="button" onClick={() => { void marketClient.refresh({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] }).then(async () => { await loadQuotes(); if (monitorService) { try { const result = await monitorService.evaluate({ now: now() }); setMonitorWarnings(result.warnings); setMonitorError(""); } catch { setMonitorError("投资逻辑监控暂时不可用"); } } await reloadAlerts(); }); }}>刷新市场数据</button>
    <p className="freshness">{delayed}</p><section className="market-pulse" aria-label="市场脉冲">{(liveQuotes?.data.length ? liveQuotes.data : data.pulses).map((pulse) => <div key={pulse.symbol}><strong>{pulse.symbol}</strong><span>{pulse.price}</span></div>)}</section>
    <section className="today-review" aria-labelledby="today-review-title"><h2 id="today-review-title">需要复核</h2>{monitorError && <p role="alert">{monitorError}</p>}{monitorWarnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{monitorWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}<ReviewQueue alerts={monitorAlerts} now={now()} onRead={(id) => { void runAction(id, "read"); }} onSnooze={(id, until) => { void runAction(id, "snooze", until); }} onArchive={(id) => { void runAction(id, "archive"); }} /></section>
    <div className="today-grid"><section><h1>今天值得关注</h1><div className="signal-list">{data.signals.map((signal) => <button key={signal.symbol} type="button" aria-pressed={signal.symbol === selected.symbol} onClick={() => setSelectedSymbol(signal.symbol)} aria-label={`查看 ${signal.symbol}`}><strong>{signal.symbol}</strong><span>{signal.trigger}</span></button>)}</div><SignalDetail signal={selected} /></section><aside><h2>本周事件</h2>{events.length ? events.map((event) => <p key={event.id}>{event.scheduledAt} · {event.type} · {event.title}</p>) : data.weekEvents.map((event) => <p key={event.symbol}>{event.date} · {event.session} · {event.symbol}</p>)}<h2>投资逻辑检查</h2>{Object.entries(data.thesisCheck).filter(([key]) => key !== "symbol").map(([key, value]) => <p key={key}>{value}</p>)}</aside></div>
  </div>;
}
function SignalDetail({ signal }: { signal: Signal }) { return <article className="signal-detail"><h2>{signal.symbol} · {signal.name}</h2><p>{signal.trigger}</p><ul>{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link to={`/stocks/${signal.symbol}`}>研究 {signal.symbol}</Link></article>; }
