import { useCallback, useEffect, useState } from "react";
import type { MarketApiClient } from "../market/marketApiClient";
import { BrokerDriftBanner } from "./BrokerDriftBanner";
import { PaperOrderHistory } from "./PaperOrderHistory";
import { PaperPortfolioPerformance } from "./PaperPortfolioPerformance";
import { PaperPortfolioApiClient, type PaperPortfolioApi, type PaperPortfolioOverviewView } from "./paperPortfolioApiClient";
import { OrderTicket } from "./OrderTicket";
import type { PaperTradingApi } from "./paperTradingApiClient";

type PaperTab = "overview" | "performance" | "orders";
type PerformanceMarketClient = Pick<MarketApiClient, "getBatchBars" | "getEvents">;
const defaultApi = new PaperPortfolioApiClient();

export function PaperPortfolioOverview({ api = defaultApi, tradingApi, marketClient }: { api?: PaperPortfolioApi; tradingApi?: PaperTradingApi; marketClient?: PerformanceMarketClient }) {
  const [data, setData] = useState<PaperPortfolioOverviewView>();
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<PaperTab>("overview");
  const load = useCallback(() => api.getOverview().then(setData), [api]);
  useEffect(() => { void load().catch(() => setMessage("Paper 组合暂不可用")); }, [load]);
  if (!data) return <p role="status">{message || "正在加载 Paper 组合"}</p>;

  return <section className="paper-portfolio">
    <div role="tablist" aria-label="Paper 组合功能">
      <button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>总览</button>
      <button role="tab" aria-selected={tab === "performance"} onClick={() => setTab("performance")}>绩效</button>
      <button role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>订单</button>
    </div>
    {tab === "overview" && <>
      <BrokerDriftBanner drift={data.drift} />
      <div className="portfolio-metrics"><p>净资产<br /><strong>{data.account?.equity ?? "—"}</strong></p><p>现金<br /><strong>{data.account?.cash ?? "—"}</strong></p><p>购买力<br /><strong>{data.account?.buyingPower ?? "—"}</strong></p><p>来源时间<br /><strong>{data.asOf ?? "—"}</strong></p></div>
      <table aria-label="Paper 持仓"><thead><tr><th>股票</th><th>数量</th><th>市值</th><th>均价</th></tr></thead><tbody>{data.positions.map((position) => <tr key={position.symbol}><th>{position.symbol}</th><td>{position.quantity}</td><td>{position.marketValue}</td><td>{position.averageEntryPrice}</td></tr>)}</tbody></table>
      {tradingApi && <OrderTicket symbol={data.positions[0]?.symbol ?? "AAPL"} api={tradingApi} disabledReason={data.drift ? "对账不一致，暂不可提交" : undefined} />}
      <button type="button" onClick={() => void api.reconcile(crypto.randomUUID()).then(() => setMessage("全量对账已进入队列"))}>重新对账</button>
      {message && <p role="status">{message}</p>}
    </>}
    {tab === "performance" && <PaperPortfolioPerformance api={api} marketClient={marketClient} activeDrift={Boolean(data.drift)} />}
    {tab === "orders" && <PaperOrderHistory api={api} />}
  </section>;
}
