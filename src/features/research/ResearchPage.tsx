import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InstrumentResearch } from "../market/domain";
import { mockMarketRepository } from "../market/mockMarketRepository";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { LocalPortfolioRepository } from "../portfolio/localPortfolioRepository";
import { ResearchPeerComparison } from "./PeerComparison";

export function ResearchPage() {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<InstrumentResearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thesisSaved, setThesisSaved] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void mockMarketRepository.getInstrument(symbol).then(setData).catch((reason: Error) => setError(reason.message)); }, [symbol]);
  if (error) return <section><p role="alert">{error}</p><Link to="/">返回今日</Link></section>;
  if (!data) return <p role="status">正在加载研究数据</p>;
  const save = () => { const thesis = new LocalThesisRepository(localStorage).save({ symbol, coreJudgment:"数据中心需求支持增长", evidence:["收入趋势"], risks:["估值压缩"], validationConditions:["下季财报"] }); setThesisSaved(Boolean(thesis)); setMessage("投资逻辑已保存"); };
  const buy = () => { new LocalPortfolioRepository(localStorage).add({symbol, quantity: 10, price:data.quote.price, thesisVersionId:"v1"}); setMessage("已加入模拟组合"); };
  return <><article><p>延迟 15 分钟</p><h1>{data.quote.symbol} · {data.quote.name}</h1><p>{data.quote.price} USD · {data.quote.changePercent}%</p><h2>营收与 EPS 趋势</h2><table><tbody>{data.financials.map((item) => <tr key={item.year}><th>{item.year}</th><td>{item.revenue}</td><td>{item.eps}</td></tr>)}</tbody></table><h2>估值区间</h2><p>{data.valuation.low} / {data.valuation.midpoint} / {data.valuation.high}</p><h2>最新证据</h2><ul>{data.evidence.map((item) => <li key={item.date}>{item.date} · {item.text}</li>)}</ul><button type="button" onClick={save}>保存投资逻辑</button><button type="button" disabled={!thesisSaved} onClick={buy}>确认模拟买入</button><p role="status">{message}</p></article><ResearchPeerComparison symbol={symbol} /></>;
}
