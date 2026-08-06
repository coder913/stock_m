import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Signal, TodayDashboard } from "../market/domain";
import { mockMarketRepository } from "../market/mockMarketRepository";
import "./today.css";

const freshnessLabel = (minutes: number) => `延迟 ${minutes} 分钟`;

export function TodayPage() {
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");

  useEffect(() => { void mockMarketRepository.getToday().then(setData); }, []);
  if (!data) return <p role="status">正在加载今日数据</p>;
  const selected = data.signals.find((signal) => signal.symbol === selectedSymbol) ?? data.signals[0];
  const delayed = data.freshness.kind === "delayed" ? freshnessLabel(data.freshness.minutes) : "模拟数据";

  return <div className="today-page">
    <p className="freshness">{delayed}</p>
    <section className="market-pulse" aria-label="市场脉冲">{data.pulses.map((pulse) => <div key={pulse.symbol}><strong>{pulse.symbol}</strong><span>{pulse.price}</span></div>)}</section>
    <div className="today-grid"><section><h1>今天值得关注</h1>
      <div className="signal-list">{data.signals.map((signal) => <button key={signal.symbol} type="button" aria-pressed={signal.symbol === selected.symbol} onClick={() => setSelectedSymbol(signal.symbol)} aria-label={`查看 ${signal.symbol}`}><strong>{signal.symbol}</strong><span>{signal.trigger}</span></button>)}</div>
      <SignalDetail signal={selected} />
    </section><aside><h2>本周事件</h2>{data.weekEvents.map((event) => <p key={event.symbol}>{event.date} · {event.session} · {event.symbol}</p>)}<h2>投资逻辑检查</h2>{Object.entries(data.thesisCheck).filter(([key]) => key !== "symbol").map(([key, value]) => <p key={key}>{value}</p>)}</aside></div>
  </div>;
}

function SignalDetail({ signal }: { signal: Signal }) { return <article className="signal-detail"><h2>{signal.symbol} · {signal.name}</h2><p>{signal.trigger}</p><ul>{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link to={`/stocks/${signal.symbol}`}>研究 {signal.symbol}</Link></article>; }
