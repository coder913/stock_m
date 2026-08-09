import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Signal, TodayDashboard } from "../market/domain";
import { MarketApiClient } from "../market/marketApiClient";
import type { DataEnvelope, MarketEvent, MarketQuote } from "../market/apiDomain";
import "./today.css";
import { todayEditorial } from "./todayEditorial";
import { ConditionRepository } from "../monitoring/conditionRepository";
import { EvaluationRepository } from "../monitoring/evaluationRepository";
import { MonitorAlertRepository } from "../monitoring/monitorAlertRepository";
import { MonitorSnapshotLoader } from "../monitoring/monitorSnapshotLoader";
import { ReviewQueue } from "../monitoring/ReviewQueue";
import { ThesisMonitorService } from "../monitoring/thesisMonitorService";
import { ThesisReviewRepository } from "../monitoring/thesisReviewRepository";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import type { MonitorAlert } from "../monitoring/domain";

const freshnessLabel = (minutes: number) => `延迟 ${minutes} 分钟`;
const defaultMarketClient = new MarketApiClient();
const currentTime = () => new Date().toISOString();
type TodayMarketClient = Pick<MarketApiClient, "getQuotes" | "getEvents" | "getUniverse" | "refresh">;
type MonitorRunner = Pick<ThesisMonitorService, "evaluate">;

export function TodayPage({ marketClient = defaultMarketClient, monitorService, monitorAlertRepository, now = currentTime }: { marketClient?: TodayMarketClient; monitorService?: MonitorRunner; monitorAlertRepository?: MonitorAlertRepository; now?: () => string }) {
  const [data] = useState<TodayDashboard>(todayEditorial);
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const [liveQuotes, setLiveQuotes] = useState<DataEnvelope<MarketQuote[]> | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlert[]>([]);
  const [monitorError, setMonitorError] = useState("");
  const [monitorWarnings, setMonitorWarnings] = useState<string[]>([]);
  const alertRepository = useMemo(() => monitorAlertRepository ?? new MonitorAlertRepository(localStorage), [monitorAlertRepository]);
  const service = useMemo(() => monitorService ?? (() => {
    const conditionRepository = new ConditionRepository(localStorage);
    const reviewRepository = new ThesisReviewRepository(localStorage);
    return new ThesisMonitorService({ conditionRepository, evaluationRepository: new EvaluationRepository(localStorage), alertRepository, reviewRepository, thesisRepository: new LocalThesisRepository(localStorage), snapshotLoader: new MonitorSnapshotLoader(marketClient) });
  })(), [monitorService, alertRepository, marketClient]);

  const loadQuotes = () => marketClient.getQuotes(["SPY", "QQQ", "DIA", "IWM"]).then(setLiveQuotes).catch(() => undefined);
  const reloadAlerts = useCallback(() => { const time = now(); alertRepository.restoreDue(time); setMonitorAlerts(alertRepository.list({ view: "pending", now: time })); }, [alertRepository, now]);
  useEffect(() => { void loadQuotes(); }, [marketClient]);
  useEffect(() => { if (typeof marketClient.getEvents === "function") void marketClient.getEvents({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }).then((result) => setEvents(result.data)).catch(() => undefined); }, [marketClient]);
  useEffect(() => { let active = true; const time = now(); reloadAlerts(); void service.evaluate({ now: time }).then((result) => { if (active) { setMonitorError(""); setMonitorWarnings(result.warnings); reloadAlerts(); } }).catch(() => { if (active) setMonitorError("投资逻辑监控暂时不可用"); }); return () => { active = false; }; }, [service, reloadAlerts, now]);
  const selected = data.signals.find((signal) => signal.symbol === selectedSymbol) ?? data.signals[0];
  const delayed = data.freshness.kind === "delayed" ? freshnessLabel(data.freshness.minutes) : "模拟数据";

  return <div className="today-page">
    <button type="button" onClick={() => { void marketClient.refresh({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] }).then(async () => { await loadQuotes(); try { const result = await service.evaluate({ now: now() }); setMonitorWarnings(result.warnings); setMonitorError(""); } catch { setMonitorError("投资逻辑监控暂时不可用"); } reloadAlerts(); }); }}>刷新市场数据</button>
    <p className="freshness">{delayed}</p>
    <section className="market-pulse" aria-label="市场脉冲">{(liveQuotes?.data.length ? liveQuotes.data : data.pulses).map((pulse) => <div key={pulse.symbol}><strong>{pulse.symbol}</strong><span>{pulse.price}</span></div>)}</section>
    <section className="today-review" aria-labelledby="today-review-title"><h2 id="today-review-title">需要复核</h2>{monitorError && <p role="alert">{monitorError}</p>}{monitorWarnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{monitorWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}<ReviewQueue alerts={monitorAlerts} now={now()} onRead={(id) => { alertRepository.markRead(id, now()); reloadAlerts(); }} onSnooze={(id, until) => { alertRepository.snooze(id, until); reloadAlerts(); }} onArchive={(id) => { alertRepository.archive(id, now()); reloadAlerts(); }} /></section>
    <div className="today-grid"><section><h1>今天值得关注</h1>
      <div className="signal-list">{data.signals.map((signal) => <button key={signal.symbol} type="button" aria-pressed={signal.symbol === selected.symbol} onClick={() => setSelectedSymbol(signal.symbol)} aria-label={`查看 ${signal.symbol}`}><strong>{signal.symbol}</strong><span>{signal.trigger}</span></button>)}</div>
      <SignalDetail signal={selected} />
    </section><aside><h2>本周事件</h2>{events.length ? events.map((event) => <p key={event.id}>{event.scheduledAt} · {event.type} · {event.title}</p>) : data.weekEvents.map((event) => <p key={event.symbol}>{event.date} · {event.session} · {event.symbol}</p>)}<h2>投资逻辑检查</h2>{Object.entries(data.thesisCheck).filter(([key]) => key !== "symbol").map(([key, value]) => <p key={key}>{value}</p>)}</aside></div>
  </div>;
}

function SignalDetail({ signal }: { signal: Signal }) { return <article className="signal-detail"><h2>{signal.symbol} · {signal.name}</h2><p>{signal.trigger}</p><ul>{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link to={`/stocks/${signal.symbol}`}>研究 {signal.symbol}</Link></article>; }
