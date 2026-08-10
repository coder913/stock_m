import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CompanyProfile, MarketQuote } from "../market/apiDomain";
import { MarketApiClient } from "../market/marketApiClient";
import { LocalPortfolioRepository } from "../portfolio/localPortfolioRepository";
import { ResearchMonitorPanel } from "../monitoring/ResearchMonitorPanel";
import type { ThesisStateService } from "../thesis/thesisApiRepository";
import type { MonitorStateService } from "../monitoring/monitorApiRepository";
import { CompanyActions } from "./CompanyActions";
import { CompanyNews } from "./CompanyNews";
import { FilingsList } from "./FilingsList";
import { FinancialTrends } from "./FinancialTrends";
import { ResearchPeerComparison } from "./PeerComparison";
import { PriceHistory } from "./PriceHistory";
import { ResearchDataSection, useResearchRequest } from "./ResearchDataSection";
import "./research.css";

const defaultMarketClient = new MarketApiClient();
type ResearchClient = Pick<MarketApiClient, "getCompany" | "getQuotes" | "getBars" | "getFinancials" | "getFilings" | "getNews" | "getEvents" | "getUniverse">;

export function ResearchPage({ marketClient = defaultMarketClient, thesisService, monitorState }: { marketClient?: ResearchClient; thesisService?: ThesisStateService; monitorState?: MonitorStateService }) {
  const { symbol = "" } = useParams();
  const [core, setCore] = useState<{ profile: CompanyProfile; quote?: MarketQuote }>();
  const [coreError, setCoreError] = useState<string>();
  const [thesisId, setThesisId] = useState<string>();
  const [message, setMessage] = useState("");
  const news = useResearchRequest(`${symbol}:news`, marketClient, () => marketClient.getNews(symbol));
  const events = useResearchRequest(`${symbol}:events`, marketClient, () => marketClient.getEvents({
    from: new Date().toISOString().slice(0, 4) + "-01-01",
    to: new Date().toISOString().slice(0, 4) + "-12-31",
    symbols: [symbol],
  }));

  useEffect(() => {
    let active = true;
    setCore(undefined);
    setCoreError(undefined);
    void Promise.all([marketClient.getCompany(symbol), marketClient.getQuotes([symbol])])
      .then(([company, quotes]) => {
        if (active) setCore({ profile: company.data, quote: quotes.data[0] });
      })
      .catch(() => { if (active) setCoreError("研究数据暂时不可用"); });
    return () => { active = false; };
  }, [marketClient, symbol]);

  if (coreError) return <section><p role="alert">{coreError}</p><Link to="/">返回今日</Link></section>;
  if (!core) return <p role="status">正在加载研究数据</p>;

  const buy = () => {
    if (core.quote?.price === undefined || !thesisId) return;
    new LocalPortfolioRepository(localStorage).add({ symbol, quantity: 10, price: core.quote.price, thesisVersionId: thesisId });
    setMessage("已加入模拟组合");
  };

  return (
    <>
      <article className="research-layout">
        <header>
          <p>延迟 15 分钟</p>
          <h1>{symbol} · {core.profile.name}</h1>
          <p>{core.quote?.price === undefined ? "当前报价不可用" : `${core.quote.price} USD`}</p>
          {core.quote?.changePercent !== undefined && <p>{core.quote.changePercent}%</p>}
        </header>
        <PriceHistory symbol={symbol} marketClient={marketClient} />
        <FinancialTrends symbol={symbol} marketClient={marketClient} />
        <FilingsList symbol={symbol} marketClient={marketClient} />
        <ResearchDataSection title="公司新闻" request={news} errorMessage="公司新闻暂时不可用" emptyMessage="暂无公司新闻">
          {(items) => <CompanyNews items={items} showHeading={false} />}
        </ResearchDataSection>
        <ResearchDataSection title="公司行为" request={events} errorMessage="公司行为暂时不可用" emptyMessage="暂无公司行为">
          {(items) => <CompanyActions items={items.filter((event) => event.type !== "earnings")} showHeading={false} />}
        </ResearchDataSection>
        <ResearchMonitorPanel symbol={symbol} marketClient={marketClient} onThesisSaved={setThesisId} thesisService={thesisService} monitorState={monitorState} />
        <div>
          <button type="button" disabled={!thesisId || core.quote?.price === undefined} onClick={buy}>确认模拟买入</button>
          <p role="status">{message}</p>
        </div>
      </article>
      <ResearchPeerComparison symbol={symbol} marketClient={marketClient} />
    </>
  );
}
