import { describe, expect, test } from "vitest";
import type { ConditionEvaluation, EventCondition, MetricCondition, MonitorMetric, MonitorSnapshot } from "./domain";
import { evaluateCondition } from "./conditionEvaluator";

const now = "2026-08-09T14:01:00Z";

function metricCondition(overrides: Partial<MetricCondition> = {}): MetricCondition {
  return {
    id: "condition-price",
    symbol: "NVDA",
    thesisVersionId: "thesis-1",
    name: "估值风险",
    direction: "risk",
    severity: "high",
    kind: "metric",
    metric: "price",
    operator: ">=",
    target: 180,
    period: "CURRENT",
    createdAt: "2026-08-09T10:00:00Z",
    updatedAt: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

function eventCondition(overrides: Partial<EventCondition> = {}): EventCondition {
  return {
    id: "condition-event",
    symbol: "NVDA",
    thesisVersionId: "thesis-1",
    name: "财报验证",
    direction: "support",
    severity: "medium",
    kind: "event",
    eventType: "earnings",
    occurrence: "before-date",
    to: "2026-08-10",
    createdAt: "2026-08-09T10:00:00Z",
    updatedAt: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

function metricSnapshot(metric: MonitorMetric, value: number | undefined, dataState: "fresh" | "stale" | "missing" | "unavailable" = "fresh"): MonitorSnapshot {
  return {
    symbol: "NVDA",
    metrics: { [metric]: { value, source: "alpaca", asOf: "2026-08-09T14:00:00Z", dataState, notices: [] } },
    events: [],
    eventsState: "fresh",
    eventsAsOf: "2026-08-09T14:00:00Z",
    generatedAt: now,
  };
}

function eventSnapshot(events: MonitorSnapshot["events"], generatedAt = now): MonitorSnapshot {
  return { symbol: "NVDA", metrics: {}, events, eventsState: "fresh", eventsAsOf: generatedAt, generatedAt };
}

function previous(status: "confirmed" | "breached"): ConditionEvaluation {
  return {
    id: "evaluation-old",
    conditionId: "condition-price",
    conditionVersion: "deadbeef",
    status,
    dataState: "fresh",
    actualValue: 170,
    targetValue: 180,
    source: "alpaca",
    asOf: "2026-08-08T14:00:00Z",
    explanation: "旧结论",
    evaluatedAt: "2026-08-08T14:01:00Z",
    changed: false,
  };
}

describe("evaluateCondition metrics", () => {
  test("marks a matching risk metric as breached with an explanation", () => {
    const evaluation = evaluateCondition({ condition: metricCondition(), snapshot: metricSnapshot("price", 190), now });

    expect(evaluation).toMatchObject({ status: "breached", dataState: "fresh", actualValue: 190, targetValue: 180, source: "alpaca" });
    expect(evaluation.explanation).toContain("190 >= 180");
  });

  test.each([
    [">", 181, 180, "confirmed"],
    [">=", 180, 180, "confirmed"],
    ["<", 179, 180, "confirmed"],
    ["<=", 180, 180, "confirmed"],
    ["between", 180, [160, 180], "confirmed"],
  ] as const)("applies %s with inclusive documented boundaries", (operator, actual, target, want) => {
    const result = evaluateCondition({
      condition: metricCondition({ direction: "support", operator, target }),
      snapshot: metricSnapshot("price", actual),
      now,
    });

    expect(result.status).toBe(want);
  });

  test("reverses the same comparison for support and risk conditions", () => {
    const snapshot = metricSnapshot("price", 190);

    expect(evaluateCondition({ condition: metricCondition({ direction: "support" }), snapshot, now }).status).toBe("confirmed");
    expect(evaluateCondition({ condition: metricCondition({ direction: "risk" }), snapshot, now }).status).toBe("breached");
  });

  test("rejects a reversed between target", () => {
    expect(() => evaluateCondition({ condition: metricCondition({ operator: "between", target: [180, 160] }), snapshot: metricSnapshot("price", 170), now })).toThrow("区间下限不能大于上限");
  });

  test.each(["stale", "missing", "unavailable"] as const)("keeps the last decisive status when current data is %s", (dataState) => {
    const result = evaluateCondition({ condition: metricCondition(), snapshot: metricSnapshot("price", dataState === "missing" ? undefined : 190, dataState), previousDecisive: previous("confirmed"), now });

    expect(result).toMatchObject({ status: "confirmed", dataState, changed: false, previousStatus: "confirmed" });
  });

  test("expires after the deadline when no decisive data exists", () => {
    const result = evaluateCondition({ condition: metricCondition({ deadline: "2026-08-08" }), snapshot: metricSnapshot("price", undefined, "missing"), now });

    expect(result).toMatchObject({ status: "expired", dataState: "missing" });
  });
});

describe("evaluateCondition events", () => {
  const earnings = { id: "earnings-nvda", type: "earnings", symbol: "NVDA", title: "NVDA earnings", scheduledAt: "2026-08-10T20:00:00Z", timing: "after-market", source: "finnhub" } as const;

  test("confirms before-date when a matching company event appears on the boundary date", () => {
    const result = evaluateCondition({ condition: eventCondition(), snapshot: eventSnapshot([earnings]), now });
    expect(result.status).toBe("confirmed");
  });

  test("keeps before-date pending until its window closes and breaches afterward", () => {
    expect(evaluateCondition({ condition: eventCondition(), snapshot: eventSnapshot([]), now }).status).toBe("pending");
    expect(evaluateCondition({ condition: eventCondition(), snapshot: eventSnapshot([], "2026-08-11T01:00:00Z"), now: "2026-08-11T01:00:00Z" }).status).toBe("breached");
  });

  test("matches within-range inclusively and requires an ascending from date", () => {
    const condition = eventCondition({ occurrence: "within-range", from: "2026-08-10", to: "2026-08-12" });
    expect(evaluateCondition({ condition, snapshot: eventSnapshot([earnings]), now }).status).toBe("confirmed");
    expect(() => evaluateCondition({ condition: { ...condition, from: "2026-08-13" }, snapshot: eventSnapshot([]), now })).toThrow("事件起始日期不能晚于结束日期");
  });

  test("confirms not-occurred-by-date only after the deadline without a matching event", () => {
    const condition = eventCondition({ occurrence: "not-occurred-by-date", to: "2026-08-10" });
    expect(evaluateCondition({ condition, snapshot: eventSnapshot([]), now }).status).toBe("pending");
    expect(evaluateCondition({ condition, snapshot: eventSnapshot([], "2026-08-11T01:00:00Z"), now: "2026-08-11T01:00:00Z" }).status).toBe("confirmed");
    expect(evaluateCondition({ condition, snapshot: eventSnapshot([earnings], "2026-08-11T01:00:00Z"), now: "2026-08-11T01:00:00Z" }).status).toBe("breached");
  });

  test("requires symbol matches for company events but not macro events", () => {
    const other = { ...earnings, id: "earnings-msft", symbol: "MSFT" };
    const macro = { ...earnings, id: "cpi", type: "macro", symbol: undefined, title: "CPI", source: "fred" } as const;

    expect(evaluateCondition({ condition: eventCondition(), snapshot: eventSnapshot([other]), now }).status).toBe("pending");
    expect(evaluateCondition({ condition: eventCondition({ eventType: "macro" }), snapshot: eventSnapshot([macro]), now }).status).toBe("confirmed");
  });
});
