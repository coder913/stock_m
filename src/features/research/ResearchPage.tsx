import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InstrumentResearch } from "../market/domain";
import { mockMarketRepository } from "../market/mockMarketRepository";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { LocalPortfolioRepository } from "../portfolio/localPortfolioRepository";
import { ResearchPeerComparison } from "./PeerComparison";
import { MarketApiClient } from "../market/marketApiClient";
const defaultMarketClient = new MarketApiClient();

export function ResearchPage({ marketClient = defaultMarketClient }: { marketClient?: Pick<MarketApiClient, "getCompany" | "getQuotes" | "getFinancials" | "getFilings"> }) {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<InstrumentResearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thesisSaved, setThesisSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [live, setLive] = useState<{ name?: string; price?: number; financials?: Array<{ label: string; value: number; periodEnd: string }>; filings?: Array<{ form: string; url: string; filedAt: string }> }>();
  useEffect(() => { void mockMarketRepository.getInstrument(symbol).then(setData).catch((reason: Error) => setError(reason.message)); }, [symbol]);
  useEffect(() => { void Promise.all([marketClient.getCompany(symbol), marketClient.getQuotes([symbol]), marketClient.getFinancials(symbol).catch(() => undefined), marketClient.getFilings(symbol).catch(() => undefined)]).then(([company, quotes, financials, filings]) => setLive({ name: company.data.name, price: quotes.data[0]?.price, financials: financials?.data.map((fact) => ({ label: fact.label, value: fact.value, periodEnd: fact.periodEnd })), filings: filings?.data.map((filing) => ({ form: filing.form, url: filing.url, filedAt: filing.filedAt })) })).catch(() => undefined); }, [marketClient, symbol]);
  if (error) return <section><p role="alert">{error}</p><Link to="/">返回今日</Link></section>;
  if (!data) return <p role="status">正在加载研究数据</p>;
  const save = () => { const thesis = new LocalThesisRepository(localStorage).save({ symbol, coreJudgment:"数据中心需求支持增长", evidence:["收入趋势"], risks:["估值压缩"], validationConditions:["下季财报"] }); setThesisSaved(Boolean(thesis)); setMessage("投资逻辑已保存"); };
  const buy = () => { new LocalPortfolioRepository(localStorage).add({symbol, quantity: 10, price:data.quote.price, thesisVersionId:"v1"}); setMessage("已加入模拟组合"); };
  const price = live?.price ?? data.quote.price; return <><article><p>延迟 15 分钟</p><h1>{data.quote.symbol} · {live?.name ?? data.quote.name}</h1><p>{price} USD · {data.quote.changePercent}%</p><h2>营收与 EPS 趋势</h2><table><tbody>{live?.financials?.length ? live.financials.map((item) => <tr key={`${item.label}:${item.periodEnd}`}><th>{item.periodEnd}</th><td>{item.label}</td><td>{item.value}</td></tr>) : data.financials.map((item) => <tr key={item.year}><th>{item.year}</th><td>{item.revenue}</td><td>{item.eps}</td></tr>)}</tbody></table>{live?.filings && <section><h2>监管文件</h2>{live.filings.map((filing) => <a key={filing.url} href={filing.url} target="_blank" rel="noreferrer">查看 {filing.form} 原文</a>)}</section>}<h2>估值区间</h2><p>{data.valuation.low} / {data.valuation.midpoint} / {data.valuation.high}</p><h2>最新证据</h2><ul>{data.evidence.map((item) => <li key={item.date}>{item.date} · {item.text}</li>)}</ul><button type="button" onClick={save}>保存投资逻辑</button><button type="button" disabled={!thesisSaved || price === undefined} onClick={buy}>确认模拟买入</button><p role="status">{message}</p></article><ResearchPeerComparison symbol={symbol} /></>;
}
