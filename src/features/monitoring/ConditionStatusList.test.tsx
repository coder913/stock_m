import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ConditionStatusList } from "./ConditionStatusList";

test("shows the last fresh conclusion separately from the latest waiting evaluation", () => {
  const condition = { id: "c1", symbol: "NVDA", thesisVersionId: "t1", kind: "metric", name: "估值", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT", conditionVersion: "v1", createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z" } as const;
  const effective = { id: "e1", conditionId: "c1", conditionVersion: "v1", status: "confirmed", dataState: "fresh", explanation: "有效结论", evaluatedAt: "2026-08-10T14:00:00Z", changed: true } as const;
  const latestEvaluation = { ...effective, id: "e2", dataState: "stale" as const, explanation: "等待新数据", evaluatedAt: "2026-08-10T14:05:00Z", changed: false };
  render(<ConditionStatusList views={[{ condition, evaluation: effective, latestEvaluation }]} />);
  expect(screen.getByText("成立")).toBeVisible();
  expect(screen.getByText("最新检查：等待新数据")).toBeVisible();
});
