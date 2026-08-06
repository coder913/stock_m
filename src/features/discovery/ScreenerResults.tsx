import { Link } from "react-router-dom";
import type { StockSnapshot } from "./domain";

interface ScreenerResultsProps { stocks: StockSnapshot[]; onAddToWatchlist(symbol: string): void; }
const display = (value: number | undefined, suffix = "") => value === undefined ? "数据缺失" : `${value}${suffix}`;

export function ScreenerResults({ stocks, onAddToWatchlist }: ScreenerResultsProps) {
  if (stocks.length === 0) return <p role="status">没有匹配结果。请逐项放宽筛选条件。</p>;
  return <table className="screener-results">
    <thead><tr><th scope="col">代码</th><th scope="col">公司</th><th scope="col">行业</th><th scope="col">价格</th><th scope="col">当日涨跌</th><th scope="col">营收增长</th><th scope="col">预期市盈率</th><th scope="col">下一事件</th><th scope="col">操作</th></tr></thead>
    <tbody>{stocks.map((stock) => <tr key={stock.symbol}>
      <th scope="row">{stock.symbol}</th><td>{stock.name}</td><td>{stock.industry}</td><td>{display(stock.metrics.price, " USD")}</td><td>{display(stock.metrics.dailyChangePercent, "%")}</td><td>{display(stock.metrics.revenueGrowthYoY, "%")}</td><td>{display(stock.metrics.forwardPE)}</td><td>{stock.nextEvent?.title ?? "数据缺失"}</td>
      <td><Link to={`/stocks/${stock.symbol}`}>研究 {stock.symbol}</Link><button type="button" onClick={() => onAddToWatchlist(stock.symbol)}>加入自选 {stock.symbol}</button></td>
    </tr>)}</tbody>
  </table>;
}
