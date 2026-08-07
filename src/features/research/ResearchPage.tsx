import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { LocalPortfolioRepository } from "../portfolio/localPortfolioRepository";
import { MarketApiClient } from "../market/marketApiClient";
import type { CompanyNewsItem, FinancialFact, MarketEvent, SecFiling } from "../market/apiDomain";
import { ResearchPeerComparison } from "./PeerComparison";
import { CompanyNews } from "./CompanyNews";
import { CompanyActions } from "./CompanyActions";

const defaultMarketClient = new MarketApiClient();
type ResearchClient = Pick<MarketApiClient, "getCompany" | "getQuotes" | "getFinancials" | "getFilings" | "getNews" | "getEvents" | "getUniverse">;

export function ResearchPage({ marketClient = defaultMarketClient }: { marketClient?: ResearchClient }) {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<{ name: string; price?: number; changePercent?: number; financials: FinancialFact[]; filings: SecFiling[]; news: CompanyNewsItem[]; actions: MarketEvent[] }>();
  const [error, setError] = useState<string>();
  const [thesisSaved, setThesisSaved] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      marketClient.getCompany(symbol),
      marketClient.getQuotes([symbol]),
      marketClient.getFinancials(symbol).catch(() => undefined),
      marketClient.getFilings(symbol).catch(() => undefined),
      marketClient.getNews(symbol).catch(() => undefined),
      marketClient.getEvents({ from: "2026-01-01", to: "2026-12-31", symbols: [symbol] }).catch(() => undefined),
    ]).then(([company, quotes, financials, filings, news, events]) => {
      if (!active) return;
      const quote = quotes.data[0];
      setData({ name: company.data.name, price: quote?.price, changePercent: quote?.changePercent, financials: financials?.data ?? [], filings: filings?.data ?? [], news: news?.data ?? [], actions: (events?.data ?? []).filter((event) => event.type !== "earnings") });
    }).catch(() => active && setError("研究数据暂不可用"));
    return () => { active = false; };
  }, [marketClient, symbol]);
  if (error) return <section><p role="alert">{error}</p><Link to="/">返回今日</Link></section>;
  if (!data) return <p role="status">正在加载研究数据</p>;
  const save = () => { const thesis = new LocalThesisRepository(localStorage).save({ symbol, coreJudgment: "数据中心需求支持增长", evidence: ["收入趋势"], risks: ["估值压缩"], validationConditions: ["下季财报"] }); setThesisSaved(Boolean(thesis)); setMessage("投资逻辑已保存"); };
  const buy = () => { if (data.price === undefined) return; new LocalPortfolioRepository(localStorage).add({ symbol, quantity: 10, price: data.price, thesisVersionId: "v1" }); setMessage("已加入模拟组合"); };
  return <><article><p>延迟 15 分钟</p><h1>{symbol} · {data.name}</h1><p>{data.price === undefined ? "当前报价不可用" : `${data.price} USD · ${data.changePercent ?? 0}%`}</p><h2>财务趋势</h2>{data.financials.length ? <table><tbody>{data.financials.map((fact) => <tr key={`${fact.concept}:${fact.periodEnd}`}><th>{fact.periodEnd}</th><td>{fact.label}</td><td>{fact.value} {fact.unit}</td></tr>)}</tbody></table> : <p>暂无财务数据</p>}<section><h2>监管文件</h2>{data.filings.map((filing) => <a key={filing.url} href={filing.url} target="_blank" rel="noreferrer">查看 {filing.form} 原文</a>)}</section><CompanyNews items={data.news} /><CompanyActions items={data.actions} /><button type="button" onClick={save}>保存投资逻辑</button><button type="button" disabled={!thesisSaved || data.price === undefined} onClick={buy}>确认模拟买入</button><p role="status">{message}</p></article><ResearchPeerComparison symbol={symbol} marketClient={marketClient} /></>;
}
