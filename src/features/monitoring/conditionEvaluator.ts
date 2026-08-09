import { conditionVersion } from "./conditionVersion";
import type { ConditionEvaluation, ConditionStatus, EventCondition, MetricCondition, MetricOperator, MonitorSnapshot, ThesisCondition } from "./domain";

interface EvaluateInput {
  condition: ThesisCondition;
  snapshot: MonitorSnapshot;
  previousDecisive?: ConditionEvaluation;
  now: string;
}

function compare(actual: number, operator: MetricOperator, target: number | readonly [number, number]): boolean {
  if (operator === "between") {
    if (!Array.isArray(target) || target.length !== 2 || target[0] > target[1]) throw new Error("区间下限不能大于上限");
    return actual >= target[0] && actual <= target[1];
  }
  if (typeof target !== "number") throw new Error("比较目标必须是数值");
  if (operator === ">") return actual > target;
  if (operator === ">=") return actual >= target;
  if (operator === "<") return actual < target;
  return actual <= target;
}

function mapStatus(direction: ThesisCondition["direction"], matched: boolean): ConditionStatus {
  if (direction === "support") return matched ? "confirmed" : "breached";
  return matched ? "breached" : "confirmed";
}

function makeEvaluation(condition: ThesisCondition, now: string, values: Omit<ConditionEvaluation, "id" | "conditionId" | "conditionVersion" | "evaluatedAt" | "changed" | "previousStatus">, previous?: ConditionEvaluation): ConditionEvaluation {
  return {
    id: crypto.randomUUID(),
    conditionId: condition.id,
    conditionVersion: condition.conditionVersion ?? conditionVersion(condition),
    evaluatedAt: now,
    ...values,
    changed: previous ? previous.status !== values.status : values.status !== "pending",
    previousStatus: previous?.status,
  };
}

function unavailableEvaluation(condition: ThesisCondition, snapshot: MonitorSnapshot, state: "missing" | "stale" | "unavailable", now: string, previous?: ConditionEvaluation, source?: ConditionEvaluation["source"], asOf?: string, actualValue?: number): ConditionEvaluation {
  if (previous) {
    return makeEvaluation(condition, now, {
      status: previous.status,
      dataState: state,
      actualValue,
      targetValue: condition.kind === "metric" ? condition.target : condition.to,
      source,
      asOf,
      explanation: `等待新数据；保留上次${previous.status === "confirmed" ? "成立" : "受损"}结论`,
    }, previous);
  }
  const expired = Boolean(condition.deadline && now.slice(0, 10) > condition.deadline);
  return makeEvaluation(condition, now, {
    status: expired ? "expired" : "pending",
    dataState: state,
    actualValue,
    targetValue: condition.kind === "metric" ? condition.target : condition.to,
    source,
    asOf: asOf ?? snapshot.generatedAt,
    explanation: expired ? "截止日期已过且仍无可判断数据" : "等待可判断数据",
  });
}

function evaluateMetric(condition: MetricCondition, snapshot: MonitorSnapshot, previous: ConditionEvaluation | undefined, now: string): ConditionEvaluation {
  const metric = snapshot.metrics[condition.metric];
  const dataState = metric?.dataState ?? "missing";
  if (dataState !== "fresh" || metric?.value === undefined) {
    const unavailableState = dataState === "fresh" ? "missing" : dataState;
    return unavailableEvaluation(condition, snapshot, unavailableState, now, previous, metric?.source, metric?.asOf, metric?.value);
  }
  const matched = compare(metric.value, condition.operator, condition.target);
  const status = mapStatus(condition.direction, matched);
  const targetText = Array.isArray(condition.target) ? `${condition.target[0]}–${condition.target[1]}` : String(condition.target);
  return makeEvaluation(condition, now, {
    status,
    dataState: "fresh",
    actualValue: metric.value,
    targetValue: condition.target,
    source: metric.source,
    asOf: metric.asOf,
    explanation: `${metric.value} ${condition.operator} ${targetText}，${status === "confirmed" ? "条件成立" : "条件受损"}`,
  }, previous);
}

function matchingEvents(condition: EventCondition, snapshot: MonitorSnapshot) {
  return snapshot.events.filter((event) => {
    if (event.type !== condition.eventType) return false;
    if (condition.eventType !== "macro" && event.symbol?.toUpperCase() !== condition.symbol.toUpperCase()) return false;
    const date = event.scheduledAt.slice(0, 10);
    if (condition.occurrence === "within-range") return Boolean(condition.from && date >= condition.from && date <= condition.to);
    return date <= condition.to;
  });
}

function evaluateEvent(condition: EventCondition, snapshot: MonitorSnapshot, previous: ConditionEvaluation | undefined, now: string): ConditionEvaluation {
  if (condition.occurrence === "within-range" && (!condition.from || condition.from > condition.to)) throw new Error("事件起始日期不能晚于结束日期");
  if (snapshot.eventsState !== "fresh") return unavailableEvaluation(condition, snapshot, snapshot.eventsState, now, previous, undefined, snapshot.eventsAsOf);

  const matches = matchingEvents(condition, snapshot);
  const today = now.slice(0, 10);
  let matched: boolean | undefined;
  if (condition.occurrence === "not-occurred-by-date") {
    matched = matches.length ? false : today > condition.to ? true : undefined;
  } else {
    matched = matches.length ? true : today > condition.to ? false : undefined;
  }
  if (matched === undefined) {
    return makeEvaluation(condition, now, {
      status: "pending",
      dataState: "fresh",
      targetValue: condition.occurrence === "within-range" ? `${condition.from}–${condition.to}` : condition.to,
      asOf: snapshot.eventsAsOf,
      explanation: `事件窗口开放至 ${condition.to}`,
    }, previous);
  }
  const status = mapStatus(condition.direction, matched);
  const event = matches[0];
  return makeEvaluation(condition, now, {
    status,
    dataState: "fresh",
    actualValue: event?.title ?? "未发生",
    targetValue: condition.occurrence === "within-range" ? `${condition.from}–${condition.to}` : condition.to,
    source: event?.source,
    asOf: event?.scheduledAt ?? snapshot.eventsAsOf,
    explanation: event ? `发现匹配事件：${event.title}` : `截至 ${condition.to} 未发现匹配事件`,
  }, previous);
}

export function evaluateCondition(input: EvaluateInput): ConditionEvaluation {
  return input.condition.kind === "metric"
    ? evaluateMetric(input.condition, input.snapshot, input.previousDecisive, input.now)
    : evaluateEvent(input.condition, input.snapshot, input.previousDecisive, input.now);
}
