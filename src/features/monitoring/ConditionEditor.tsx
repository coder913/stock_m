import { useEffect, useState } from "react";
import type { ConditionDirection, ConditionDraft, EventConditionDraft, MetricConditionDraft, MonitorMetric } from "./domain";

const metricOptions: Array<[MonitorMetric, string]> = [
  ["price", "价格"], ["dailyChangePercent", "日涨跌幅"], ["revenueGrowthYoY", "营收同比增长"], ["operatingMargin", "营业利润率"], ["freeCashFlow", "自由现金流"], ["freeCashFlowYield", "自由现金流收益率"], ["netDebtToEbitda", "净债务/EBITDA"], ["earningsSurprise", "盈利超预期"], ["grossMarginYoYChange", "毛利率同比变化"], ["priceVs20DayHigh", "距 20 日高点"], ["relativeVolume", "相对成交量"], ["averageDollarVolume20d", "20 日平均成交额"],
];

const newMetric = (direction: ConditionDirection): MetricConditionDraft => ({ id: crypto.randomUUID(), kind: "metric", name: direction === "risk" ? "估值风险" : "增长验证", direction, severity: "medium", metric: "price", operator: ">=", target: 0, period: "CURRENT" });

function toEvent(draft: ConditionDraft): EventConditionDraft {
  return { id: draft.id, kind: "event", name: draft.name, direction: draft.direction, severity: draft.severity, deadline: draft.deadline, note: draft.note, eventType: "earnings", occurrence: "before-date", to: "" };
}
function toMetric(draft: ConditionDraft): MetricConditionDraft {
  return { id: draft.id, kind: "metric", name: draft.name, direction: draft.direction, severity: draft.severity, deadline: draft.deadline, note: draft.note, metric: "price", operator: ">=", target: 0, period: "CURRENT" };
}

export function validateConditionDraft(draft: ConditionDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("请填写条件名称");
  if (draft.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline)) errors.push("截止日期格式应为 YYYY-MM-DD");
  if (draft.kind === "metric") {
    if (draft.operator === "between") {
      const [lower, upper] = Array.isArray(draft.target) ? draft.target : [undefined, undefined];
      if (!Number.isFinite(lower)) errors.push("请填写区间下限");
      if (!Number.isFinite(upper)) errors.push("请填写区间上限");
      if (Number.isFinite(lower) && Number.isFinite(upper) && lower! > upper!) errors.push("区间下限不能大于上限");
    } else if (!Number.isFinite(draft.target)) errors.push("请填写目标值");
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.to)) errors.push("请填写事件结束日期");
    if (draft.occurrence === "within-range" && !draft.from) errors.push("区间事件需要起始日期");
  }
  return errors;
}

export function ConditionEditor({ drafts, onChange }: { drafts: ConditionDraft[]; onChange: (drafts: ConditionDraft[]) => void }) {
  const [items, setItems] = useState<ConditionDraft[]>(() => structuredClone(drafts));
  useEffect(() => setItems(structuredClone(drafts)), [drafts]);

  const commit = (next: ConditionDraft[]) => { setItems(next); onChange(structuredClone(next)); };
  const update = (index: number, next: ConditionDraft) => commit(items.map((item, itemIndex) => itemIndex === index ? next : item));

  return (
    <section className="condition-editor" aria-labelledby="condition-editor-title">
      <header><h3 id="condition-editor-title">验证条件</h3><div className="monitor-actions"><button type="button" onClick={() => commit([...items, newMetric("support")])}>添加支持条件</button><button type="button" onClick={() => commit([...items, newMetric("risk")])}>添加风险条件</button></div></header>
      {!items.length && <p>尚未添加结构化条件。</p>}
      {items.map((draft, index) => {
        const errors = validateConditionDraft(draft);
        return (
          <fieldset className="condition-draft" key={draft.id}>
            <legend>{draft.direction === "support" ? "支持条件" : "风险条件"}</legend>
            <label>条件名称<input value={draft.name} onChange={(event) => update(index, { ...draft, name: event.target.value })} /></label>
            <label>条件类型<select value={draft.kind} onChange={(event) => update(index, event.target.value === "event" ? toEvent(draft) : toMetric(draft))}><option value="metric">指标</option><option value="event">事件</option></select></label>
            <label>严重程度<select value={draft.severity} onChange={(event) => update(index, { ...draft, severity: event.target.value as ConditionDraft["severity"] })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
            {draft.kind === "metric" ? <>
              <label>指标<select value={draft.metric} onChange={(event) => update(index, { ...draft, metric: event.target.value as MonitorMetric })}>{metricOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>比较符<select value={draft.operator} onChange={(event) => { const operator = event.target.value as MetricConditionDraft["operator"]; update(index, { ...draft, operator, target: operator === "between" ? [Number.NaN, Number.NaN] : 0 }); }}><option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option><option value="between">区间</option></select></label>
              {draft.operator === "between" ? <>
                <label>区间下限<input type="number" value={Array.isArray(draft.target) && Number.isFinite(draft.target[0]) ? draft.target[0] : ""} onChange={(event) => update(index, { ...draft, target: [event.target.value === "" ? Number.NaN : Number(event.target.value), Array.isArray(draft.target) ? draft.target[1] : Number.NaN] })} /></label>
                <label>区间上限<input type="number" value={Array.isArray(draft.target) && Number.isFinite(draft.target[1]) ? draft.target[1] : ""} onChange={(event) => update(index, { ...draft, target: [Array.isArray(draft.target) ? draft.target[0] : Number.NaN, event.target.value === "" ? Number.NaN : Number(event.target.value)] })} /></label>
              </> : <label>目标值<input type="number" value={typeof draft.target === "number" && Number.isFinite(draft.target) ? draft.target : ""} onChange={(event) => update(index, { ...draft, target: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></label>}
              <label>周期<select value={draft.period} onChange={(event) => update(index, { ...draft, period: event.target.value as MetricConditionDraft["period"] })}><option value="CURRENT">当前</option><option value="MRQ">最近季度</option><option value="TTM">过去十二个月</option></select></label>
            </> : <>
              <label>事件类型<select value={draft.eventType} onChange={(event) => update(index, { ...draft, eventType: event.target.value as EventConditionDraft["eventType"] })}><option value="earnings">财报</option><option value="dividend">分红</option><option value="split">拆股</option><option value="corporate-action">公司行为</option><option value="macro">宏观发布</option></select></label>
              <label>事件语义<select value={draft.occurrence} onChange={(event) => update(index, { ...draft, occurrence: event.target.value as EventConditionDraft["occurrence"], from: event.target.value === "within-range" ? draft.from : undefined })}><option value="before-date">日期前发生</option><option value="within-range">区间内发生</option><option value="not-occurred-by-date">截至日期未发生</option></select></label>
              {draft.occurrence === "within-range" && <label>事件起始日期<input type="date" value={draft.from ?? ""} onChange={(event) => update(index, { ...draft, from: event.target.value })} /></label>}
              <label>事件结束日期<input type="date" value={draft.to} onChange={(event) => update(index, { ...draft, to: event.target.value })} /></label>
            </>}
            <label>截止日期<input type="date" value={draft.deadline ?? ""} onChange={(event) => update(index, { ...draft, deadline: event.target.value || undefined })} /></label>
            <label>备注<textarea value={draft.note ?? ""} onChange={(event) => update(index, { ...draft, note: event.target.value || undefined })} /></label>
            {errors.length > 0 && <p role="alert">{errors.join("；")}</p>}
            <button type="button" onClick={() => commit(items.filter((_, itemIndex) => itemIndex !== index))}>删除草稿条件</button>
          </fieldset>
        );
      })}
    </section>
  );
}
