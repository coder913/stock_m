import { beforeEach, describe, expect, test } from "vitest";
import { ConditionRepository } from "./conditionRepository";
import type { MetricConditionDraft, ThesisCondition } from "./domain";

const riskPriceDraft = (id = "condition-1"): MetricConditionDraft => ({ id, kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" });

const storedCondition = (): ThesisCondition => ({ ...riskPriceDraft(), symbol: "NVDA", thesisVersionId: "thesis-1", createdAt: "2026-08-09T10:00:00Z", updatedAt: "2026-08-09T10:00:00Z", conditionVersion: "deadbeef" });

beforeEach(() => localStorage.clear());

describe("ConditionRepository", () => {
  test("binds normalized conditions to one immutable thesis version", () => {
    const repo = new ConditionRepository(localStorage);
    const saved = repo.saveForThesis({ symbol: "nvda", thesisVersionId: "thesis-1", conditions: [riskPriceDraft()], now: "2026-08-09T10:00:00Z" });

    expect(saved[0]).toMatchObject({ symbol: "NVDA", thesisVersionId: "thesis-1", deletedAt: undefined });
    expect(saved[0].conditionVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(repo.listForThesis("thesis-1")).toHaveLength(1);
  });

  test("isolates a corrupt stored record without dropping valid records", () => {
    localStorage.setItem("stock_m:thesis-conditions:v1", JSON.stringify([storedCondition(), { id: 42 }]));
    const repo = new ConditionRepository(localStorage);

    expect(repo.listActive()).toEqual([expect.objectContaining({ id: "condition-1" })]);
    expect(repo.getWarnings()).toContain("已跳过 1 条损坏的监控条件");
  });

  test("soft deletes without removing history", () => {
    const repo = new ConditionRepository(localStorage);
    repo.saveForThesis({ symbol: "NVDA", thesisVersionId: "thesis-1", conditions: [riskPriceDraft()], now: "2026-08-09T10:00:00Z" });

    const deleted = repo.softDelete("condition-1", "2026-08-10T10:00:00Z");
    expect(deleted.deletedAt).toBe("2026-08-10T10:00:00Z");
    expect(repo.listActive()).toEqual([]);
    expect(repo.listForThesis("thesis-1", { includeDeleted: true })).toHaveLength(1);
  });

  test("rejects duplicate ids and invalid between bounds", () => {
    const repo = new ConditionRepository(localStorage);
    expect(() => repo.saveForThesis({ symbol: "NVDA", thesisVersionId: "thesis-1", conditions: [riskPriceDraft(), riskPriceDraft()], now: "2026-08-09T10:00:00Z" })).toThrow("条件 ID 不能重复");
    expect(() => repo.saveForThesis({ symbol: "NVDA", thesisVersionId: "thesis-1", conditions: [{ ...riskPriceDraft(), operator: "between", target: [200, 100] }], now: "2026-08-09T10:00:00Z" })).toThrow("区间下限不能大于上限");
  });
});
