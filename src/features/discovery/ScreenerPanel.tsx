import type { ScreenerCondition, ScreenerOperator, ScreenerTemplate } from "./domain";
import { metricDefinitions } from "./templates";

interface ScreenerPanelProps {
  templates: readonly ScreenerTemplate[];
  conditions: ScreenerCondition[];
  onTemplateSelect(template: ScreenerTemplate): void;
  onConditionValueChange(id: string, value: number): void;
  onConditionOperatorChange(id: string, operator: ScreenerOperator): void;
  onRemoveCondition(id: string): void;
  onAddCondition(): void;
}

const labelFor = (metric: ScreenerCondition["metric"]) => metricDefinitions.find((item) => item.metric === metric)?.label ?? metric;

export function ScreenerPanel({ templates, conditions, onTemplateSelect, onConditionValueChange, onConditionOperatorChange, onRemoveCondition, onAddCondition }: ScreenerPanelProps) {
  return <aside className="screener-panel" aria-label="筛选条件">
    <h2>策略模板</h2>
    <div className="template-list">
      {templates.map((template) => <button key={template.id} type="button" onClick={() => onTemplateSelect(template)}>{template.name}</button>)}
    </div>
    <h2>筛选条件</h2>
    <div className="condition-list">
      {conditions.map((condition) => <label key={condition.id}>
        <span>{labelFor(condition.metric)}</span><select aria-label={`${labelFor(condition.metric)}运算符`} value={condition.operator} onChange={(event) => onConditionOperatorChange(condition.id, event.target.value as ScreenerOperator)}>{[">", ">=", "<", "<=", "="].map((operator) => <option key={operator}>{operator}</option>)}</select>
        <input aria-label={`${labelFor(condition.metric)}下限`} type="number" value={Array.isArray(condition.value) ? condition.value[0] : condition.value} onChange={(event) => onConditionValueChange(condition.id, Number(event.target.value))} />
        <button type="button" onClick={() => onRemoveCondition(condition.id)}>移除条件</button>
      </label>)}
    </div>
    <button type="button" onClick={onAddCondition}>添加条件</button>
  </aside>;
}
