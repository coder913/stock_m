import type { ConditionView, EvaluationDataState } from "./domain";

const statusLabels = { pending: "待验证", confirmed: "成立", breached: "受损", expired: "已过期" } as const;
const dataLabels: Record<EvaluationDataState, string> = { fresh: "数据新鲜", stale: "等待新数据（旧缓存）", missing: "等待新数据（缺失）", unavailable: "等待新数据（不可用）" };

export function ConditionStatusList({ views, onDelete }: { views: ConditionView[]; onDelete?: (conditionId: string) => void }) {
  if (!views.length) return <p>当前投资逻辑暂无结构化监控条件。</p>;
  return <div className="condition-status-list">{views.map(({ condition, evaluation }) => <article className="condition-status-card" key={condition.id}>
    <header><strong>{condition.name}</strong><span className={`condition-status condition-status--${evaluation?.status ?? "pending"}`}>{statusLabels[evaluation?.status ?? "pending"]}</span></header>
    <p>{condition.direction === "support" ? "支持" : "风险"} · {condition.severity === "high" ? "高" : condition.severity === "medium" ? "中" : "低"}严重度</p>
    {evaluation ? <>
      <p>实际值：{evaluation.actualValue ?? "—"} · 目标：{Array.isArray(evaluation.targetValue) ? evaluation.targetValue.join("–") : evaluation.targetValue ?? "—"}</p>
      <p>来源：{evaluation.source ?? "—"} · 数据时间：{evaluation.asOf ? new Date(evaluation.asOf).toLocaleString() : "—"}</p>
      <p>{dataLabels[evaluation.dataState]}</p><p>{evaluation.explanation}</p>
    </> : <p>尚未评估。</p>}
    {onDelete && <button type="button" onClick={() => onDelete(condition.id)}>删除已保存条件</button>}
  </article>)}</div>;
}
