import type { PerformanceSummary as Summary } from "./performance/domain";

const percent = (value: number | undefined, reason: string) => value === undefined ? <><strong>—</strong><small>{reason}</small></> : <strong>{(value * 100).toFixed(2)}%</strong>;

export function PerformanceSummary({ summary }: { summary: Summary }) {
  return <section className="performance-summary" aria-label="绩效摘要">
    <p>时间加权收益{percent(summary.twr, "TWR 暂不可用")}</p>
    <p>资金加权收益{percent(summary.mwr, "MWR 无法计算：现金流不足")}</p>
    <p>比较基准{percent(summary.benchmarkReturn, "基准历史不足")}</p>
    <p>超额收益{percent(summary.excessReturn, "超额收益暂不可用")}</p>
    <p>最大回撤{percent(summary.maximumDrawdown, "回撤暂不可用")}</p>
    <p>上涨日占比{percent(summary.positiveDayRate, "有效交易日不足")}</p>
  </section>;
}
