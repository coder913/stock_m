import type { ScreenerCondition, ScreenerTemplate } from "./domain";
import { metricDefinitions } from "./templates";

interface ScreenerPanelProps {
  templates: readonly ScreenerTemplate[];
  conditions: ScreenerCondition[];
  onTemplateSelect(template: ScreenerTemplate): void;
  onConditionValueChange(id: string, value: number): void;
}

const labelFor = (metric: ScreenerCondition["metric"]) => metricDefinitions.find((item) => item.metric === metric)?.label ?? metric;

export function ScreenerPanel({ templates, conditions, onTemplateSelect, onConditionValueChange }: ScreenerPanelProps) {
  return <aside className="screener-panel" aria-label="筛选条件">
    <h2>策略模板</h2>
    <div className="template-list">
      {templates.map((template) => <button key={template.id} type="button" onClick={() => onTemplateSelect(template)}>{template.name}</button>)}
    </div>
    <h2>筛选条件</h2>
    <div className="condition-list">
      {conditions.map((condition) => <label key={condition.id}>
        <span>{labelFor(condition.metric)}</span><span aria-hidden="true">{condition.operator}</span>
        <input aria-label={`${labelFor(condition.metric)}下限`} type="number" value={Array.isArray(condition.value) ? condition.value[0] : condition.value} onChange={(event) => onConditionValueChange(condition.id, Number(event.target.value))} />
      </label>)}
    </div>
  </aside>;
}
