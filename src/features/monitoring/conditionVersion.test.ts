import { describe, expect, test } from "vitest";
import { conditionVersion } from "./conditionVersion";

describe("conditionVersion", () => {
  test("produces the same version for semantically identical condition objects", () => {
    const left = { kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" } as const;
    const right = { period: "CURRENT", target: 180, operator: ">=", metric: "price", severity: "high", direction: "risk", name: "估值风险", kind: "metric" } as const;

    expect(conditionVersion(left)).toBe(conditionVersion(right));
    expect(conditionVersion(left)).toMatch(/^[0-9a-f]{8}$/);
  });

  test("ignores generated persistence fields but preserves array order", () => {
    const base = { kind: "metric", name: "区间", direction: "support", severity: "medium", metric: "price", operator: "between", target: [160, 180], period: "CURRENT" } as const;
    const generated = { ...base, id: "condition-1", symbol: "NVDA", thesisVersionId: "thesis-1", createdAt: "2026-08-09T10:00:00Z" };

    expect(conditionVersion(generated)).toBe(conditionVersion(base));
    expect(conditionVersion({ ...base, target: [180, 160] })).not.toBe(conditionVersion(base));
  });
});
