import type { ThesisHealthSummary } from "./domain";

const healthLabels = { normal: "正常", "review-needed": "需要复核", invalidated: "已失效", archived: "已归档", unmonitored: "无监控条件" } as const;

export function PortfolioHealth({ summary }: { summary: ThesisHealthSummary }) {
  return <section className="portfolio-health" aria-labelledby="portfolio-health-title">
    <h2 id="portfolio-health-title">投资逻辑健康</h2>
    <div className="portfolio-health-metrics"><p>受损条件 {summary.breachedCount}</p><p>7 日内到期 {summary.expiringCount}</p><p>未读提醒 {summary.unreadAlertCount}</p></div>
    <table aria-label="持仓投资逻辑健康"><thead><tr><th>代码</th><th>健康状态</th><th>受损</th><th>到期</th><th>未读</th><th>操作</th></tr></thead><tbody>{summary.items.map((item) => <tr key={item.symbol}><th>{item.symbol}</th><td><span className={`thesis-health thesis-health--${item.status}`}>{healthLabels[item.status]}</span></td><td>{item.breachedCount}</td><td>{item.expiringCount}</td><td>{item.unreadAlertCount}</td><td><a href={`/stocks/${item.symbol}`}>复核 {item.symbol}</a></td></tr>)}</tbody></table>
  </section>;
}
