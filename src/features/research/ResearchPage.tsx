import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InstrumentResearch } from "../market/domain";
import { mockMarketRepository } from "../market/mockMarketRepository";

export function ResearchPage() {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<InstrumentResearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void mockMarketRepository.getInstrument(symbol).then(setData).catch((reason: Error) => setError(reason.message)); }, [symbol]);
  if (error) return <section><p role="alert">{error}</p><Link to="/">返回今日</Link></section>;
  if (!data) return <p role="status">正在加载研究数据</p>;
  return <article><p>延迟 15 分钟</p><h1>{data.quote.symbol} · {data.quote.name}</h1><p>{data.quote.price} USD · {data.quote.changePercent}%</p><h2>营收与 EPS 趋势</h2><table><tbody>{data.financials.map((item) => <tr key={item.year}><th>{item.year}</th><td>{item.revenue}</td><td>{item.eps}</td></tr>)}</tbody></table><h2>估值区间</h2><p>{data.valuation.low} / {data.valuation.midpoint} / {data.valuation.high}</p><h2>最新证据</h2><ul>{data.evidence.map((item) => <li key={item.date}>{item.date} · {item.text}</li>)}</ul><button type="button">更新投资逻辑</button><button type="button">加入模拟组合</button></article>;
}
