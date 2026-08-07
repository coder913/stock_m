import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Signal, TodayDashboard } from "../market/domain";
import { MarketApiClient } from "../market/marketApiClient";
import type { DataEnvelope, MarketEvent, MarketQuote } from "../market/apiDomain";
import "./today.css";
import { todayEditorial } from "./todayEditorial";

const freshnessLabel = (minutes: number) => `延迟 ${minutes} 分钟`;
const defaultMarketClient = new MarketApiClient();

export function TodayPage({ marketClient = defaultMarketClient }: { marketClient?: Pick<MarketApiClient, "getQuotes" | "getEvents" | "refresh"> }) {
  const [data] = useState<TodayDashboard>(todayEditorial);
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const [liveQuotes, setLiveQuotes] = useState<DataEnvelope<MarketQuote[]> | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);

  const loadQuotes = () => void marketClient.getQuotes(["SPY", "QQQ", "DIA", "IWM"]).then(setLiveQuotes).catch(() => undefined);
  useEffect(() => { loadQuotes(); }, [marketClient]);
  useEffect(() => { if (typeof marketClient.getEvents === "function") void marketClient.getEvents({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }).then((result) => setEvents(result.data)).catch(() => undefined); }, [marketClient]);
  const selected = data.signals.find((signal) => signal.symbol === selectedSymbol) ?? data.signals[0];
  const delayed = data.freshness.kind === "delayed" ? freshnessLabel(data.freshness.minutes) : "模拟数据";

  return <div className="today-page">
    <button type="button" onClick={() => { void marketClient.refresh({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] }).then(loadQuotes); }}>刷新市场数据</button>
    <p className="freshness">{delayed}</p>
    <section className="market-pulse" aria-label="市场脉冲">{(liveQuotes?.data.length ? liveQuotes.data : data.pulses).map((pulse) => <div key={pulse.symbol}><strong>{pulse.symbol}</strong><span>{pulse.price}</span></div>)}</section>
    <div className="today-grid"><section><h1>今天值得关注</h1>
      <div className="signal-list">{data.signals.map((signal) => <button key={signal.symbol} type="button" aria-pressed={signal.symbol === selected.symbol} onClick={() => setSelectedSymbol(signal.symbol)} aria-label={`查看 ${signal.symbol}`}><strong>{signal.symbol}</strong><span>{signal.trigger}</span></button>)}</div>
      <SignalDetail signal={selected} />
    </section><aside><h2>本周事件</h2>{events.length ? events.map((event) => <p key={event.id}>{event.scheduledAt} · {event.type} · {event.title}</p>) : data.weekEvents.map((event) => <p key={event.symbol}>{event.date} · {event.session} · {event.symbol}</p>)}<h2>投资逻辑检查</h2>{Object.entries(data.thesisCheck).filter(([key]) => key !== "symbol").map(([key, value]) => <p key={key}>{value}</p>)}</aside></div>
  </div>;
}

function SignalDetail({ signal }: { signal: Signal }) { return <article className="signal-detail"><h2>{signal.symbol} · {signal.name}</h2><p>{signal.trigger}</p><ul>{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link to={`/stocks/${signal.symbol}`}>研究 {signal.symbol}</Link></article>; }
