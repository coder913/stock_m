import type { ScreenValidationError, ScreenerCondition, StockSnapshot } from "./domain";

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const matches = (actual: number, condition: ScreenerCondition): boolean => {
  if (condition.operator === "between") {
    if (!Array.isArray(condition.value)) return false;
    const [minimum, maximum] = condition.value;
    return actual >= minimum && actual <= maximum;
  }
  if (!isFiniteNumber(condition.value)) return false;
  switch (condition.operator) {
    case ">": return actual > condition.value;
    case ">=": return actual >= condition.value;
    case "<": return actual < condition.value;
    case "<=": return actual <= condition.value;
    case "=": return actual === condition.value;
  }
};

export function runScreen(stocks: StockSnapshot[], conditions: ScreenerCondition[]): StockSnapshot[] {
  if (validateConditions(conditions).length > 0) return [];
  return stocks.filter((stock) => conditions.every((condition) => {
    const value = stock.metrics[condition.metric];
    return isFiniteNumber(value) && matches(value, condition);
  }));
}

export function validateConditions(conditions: ScreenerCondition[]): ScreenValidationError[] {
  const errors: ScreenValidationError[] = [];
  const bounds = new Map<string, { minimum?: number; maximum?: number; ids: string[] }>();

  for (const condition of conditions) {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (!values.every(isFiniteNumber)) {
      errors.push({ conditionId: condition.id, code: "invalid-value", message: "条件值必须是有效数字" });
      continue;
    }
    if (condition.operator === "between") {
      const [minimum, maximum] = condition.value as readonly [number, number];
      if (minimum > maximum) {
        errors.push({ conditionId: condition.id, code: "invalid-range", message: "区间下限不能大于上限" });
        continue;
      }
    }

    const key = `${condition.metric}:${condition.period}`;
    const bound = bounds.get(key) ?? { ids: [] };
    bound.ids.push(condition.id);
    if (condition.operator === ">" || condition.operator === ">=") bound.minimum = Math.max(bound.minimum ?? -Infinity, condition.value as number);
    if (condition.operator === "<" || condition.operator === "<=") bound.maximum = Math.min(bound.maximum ?? Infinity, condition.value as number);
    if (condition.operator === "between") {
      const [minimum, maximum] = condition.value as readonly [number, number];
      bound.minimum = Math.max(bound.minimum ?? -Infinity, minimum);
      bound.maximum = Math.min(bound.maximum ?? Infinity, maximum);
    }
    bounds.set(key, bound);
  }

  for (const bound of bounds.values()) {
    if (bound.minimum !== undefined && bound.maximum !== undefined && bound.minimum > bound.maximum) {
      errors.push(...bound.ids.map((conditionId) => ({ conditionId, code: "conflict" as const, message: "同一指标的条件相互冲突" })));
    }
  }
  return errors;
}
