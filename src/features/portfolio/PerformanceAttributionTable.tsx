import type { AttributionResult } from "./performance/domain";

export function PerformanceAttributionTable({ attribution }: { attribution?: AttributionResult }) {
  if (!attribution) return <p>贡献分析暂不可用</p>;
  if (!attribution.reconciled) return <p role="alert">贡献对账失败：{attribution.diagnostic}</p>;
  return <section><p>贡献已对账</p><table aria-label="绩效贡献"><thead><tr><th>项目</th><th>收益贡献</th><th>金额盈亏</th><th>已实现</th><th>未实现</th><th>分红</th><th>费用</th></tr></thead><tbody>{attribution.items.map((item) => <tr key={item.key}><th>{item.label}</th><td>{item.returnContribution === undefined ? "—" : `${(item.returnContribution * 100).toFixed(2)}%`}</td><td>{item.moneyContribution.toFixed(2)}</td><td>{item.realizedPnl.toFixed(2)}</td><td>{item.unrealizedPnl.toFixed(2)}</td><td>{item.dividends.toFixed(2)}</td><td>{item.fees.toFixed(2)}</td></tr>)}</tbody></table></section>;
}
