import { beforeEach, expect, test } from "vitest";
import { EvaluationRepository } from "./evaluationRepository";
import type { ConditionEvaluation } from "./domain";

beforeEach(() => localStorage.clear());

const evaluation = (overrides: Partial<ConditionEvaluation> = {}): ConditionEvaluation => ({
  id: "evaluation-1", conditionId: "condition-1", conditionVersion: "deadbeef", status: "confirmed", dataState: "fresh", actualValue: 170, targetValue: 180, source: "alpaca", asOf: "2026-08-09T10:00:00Z", explanation: "170 < 180", evaluatedAt: "2026-08-09T10:01:00Z", changed: true, ...overrides,
});

test("deduplicates the same condition result and data timestamp", () => {
  const repo = new EvaluationRepository(localStorage);
  expect(repo.append(evaluation()).inserted).toBe(true);
  expect(repo.append(evaluation({ id: "evaluation-2" })).inserted).toBe(false);
  expect(repo.list("condition-1")).toHaveLength(1);
});

test("keeps histories separate for conditions sharing a version", () => {
  const repo = new EvaluationRepository(localStorage);
  repo.append(evaluation());
  repo.append(evaluation({ id: "evaluation-2", conditionId: "condition-2" }));
  expect(repo.list("condition-1")).toHaveLength(1);
  expect(repo.list("condition-2")).toHaveLength(1);
});

test("returns the latest fresh decisive evaluation", () => {
  const repo = new EvaluationRepository(localStorage);
  repo.append(evaluation());
  repo.append(evaluation({ id: "evaluation-2", dataState: "stale", status: "breached", asOf: "2026-08-09T11:00:00Z", evaluatedAt: "2026-08-09T11:01:00Z" }));
  expect(repo.latest("condition-1")?.id).toBe("evaluation-2");
  expect(repo.latestDecisive("condition-1")?.id).toBe("evaluation-1");
});
