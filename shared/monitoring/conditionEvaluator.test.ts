// @vitest-environment node
import { expect, test } from "vitest";
import type { ConditionEvaluation, MetricCondition, MonitorSnapshot } from "../monitoring";
import { evaluateCondition } from "./conditionEvaluator";

const condition: MetricCondition = {
  id: "condition-price", symbol: "NVDA", thesisVersionId: "thesis-1", name: "valuation risk",
  direction: "risk", severity: "high", kind: "metric", metric: "price", operator: ">=", target: 180,
  period: "CURRENT", conditionVersion: "version-1", createdAt: "2026-08-09T10:00:00Z", updatedAt: "2026-08-09T10:00:00Z",
};
const previous: ConditionEvaluation = {
  id: "evaluation-old", conditionId: condition.id, conditionVersion: "version-1", status: "breached", dataState: "fresh",
  actualValue: 190, targetValue: 180, source: "alpaca", asOf: "2026-08-10T14:00:00Z", explanation: "breached",
  evaluatedAt: "2026-08-10T14:01:00Z", changed: true, previousStatus: "confirmed",
};

test("shared evaluator preserves the last fresh conclusion when a stale value looks recovered", () => {
  const snapshot: MonitorSnapshot = {
    symbol: "NVDA", metrics: { price: { value: 170, source: "alpaca", asOf: "2026-08-10T14:00:00Z", dataState: "stale", notices: ["fallback"] } },
    events: [], eventsState: "fresh", generatedAt: "2026-08-10T14:06:00Z",
  };

  expect(evaluateCondition({ condition, snapshot, previousDecisive: previous, now: "2026-08-10T14:07:00Z" })).toMatchObject({
    status: "breached", dataState: "stale", changed: false, previousStatus: "breached",
  });
});
