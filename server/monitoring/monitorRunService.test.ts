// @vitest-environment node
import { expect, test } from "vitest";
import type { ConditionEvaluation, MetricCondition, MonitorAlert, MonitorSnapshot } from "../../shared/monitoring";
import type { ClaimedMonitorRun } from "./monitorScheduleRepository";
import { MonitorRunService, type MonitorRunStore } from "./monitorRunService";

const condition: MetricCondition = {
  id: "condition-price", symbol: "NVDA", thesisVersionId: "thesis-1", name: "valuation risk", direction: "risk", severity: "high",
  kind: "metric", metric: "price", operator: ">=", target: 180, period: "CURRENT", conditionVersion: "version-1",
  createdAt: "2026-08-09T10:00:00Z", updatedAt: "2026-08-09T10:00:00Z",
};

function snapshot(value: number, dataState: "fresh" | "stale" | "missing" | "unavailable" = "fresh"): MonitorSnapshot {
  return { symbol: "NVDA", metrics: { price: { value, source: "alpaca", asOf: "2026-08-10T14:05:00Z", dataState, notices: [] } }, events: [], eventsState: "fresh", generatedAt: "2026-08-10T14:07:00Z" };
}

class MemoryRunStore implements MonitorRunStore {
  evaluations: ConditionEvaluation[] = [];
  alerts: MonitorAlert[] = [];
  constructor(private readonly conditions = [condition]) {}
  async listActiveForRun() { return this.conditions; }
  async latestEffective(conditionId: string, conditionVersion: string) { return this.evaluations.filter((item) => item.conditionId === conditionId && item.conditionVersion === conditionVersion && item.dataState === "fresh").at(-1); }
  async start() {}
  async fail() {}
  async commit(_run: ClaimedMonitorRun, evaluations: ConditionEvaluation[], alerts: MonitorAlert[]) {
    this.evaluations.push(...evaluations);
    for (const alert of alerts) if (!this.alerts.some(({ dedupeKey }) => dedupeKey === alert.dedupeKey)) this.alerts.push(alert);
  }
}

const run = (naturalPeriod: string): ClaimedMonitorRun => ({ id: `run-${naturalPeriod}`, type: "price", naturalPeriod, scheduledFor: "2026-08-10T14:05:00.000Z", catchUp: true, status: "claimed" });

test("fresh transition creates one alert while stale recovery preserves the breached conclusion", async () => {
  const store = new MemoryRunStore();
  store.evaluations.push({ id: "old", conditionId: condition.id, conditionVersion: "version-1", status: "confirmed", dataState: "fresh", explanation: "old", evaluatedAt: "2026-08-10T14:00:00Z", changed: false });
  let current = snapshot(190);
  const service = new MonitorRunService({ store, snapshotClient: { load: async () => ({ snapshots: new Map([["NVDA", current]]), provenance: { dataState: current.metrics.price!.dataState, sources: ["alpaca"], generatedAt: current.generatedAt } }) } });

  await service.run(run("2026-08-10T10:05-04:00"), "2026-08-10T14:07:00Z");
  current = snapshot(170, "stale");
  await service.run(run("2026-08-10T10:10-04:00"), "2026-08-10T14:12:00Z");

  expect(store.evaluations.at(-1)).toMatchObject({ status: "breached", dataState: "stale", changed: false });
  expect(store.alerts.filter((alert) => alert.toStatus === "confirmed")).toHaveLength(0);
  expect(store.alerts.filter((alert) => alert.toStatus === "breached")).toHaveLength(1);
});

test("loads all active symbols in one batch and isolates prior conclusions by condition version", async () => {
  const second = { ...condition, id: "condition-msft", symbol: "MSFT", conditionVersion: "version-2" };
  const store = new MemoryRunStore([condition, second]);
  store.evaluations.push({ id: "wrong-version", conditionId: condition.id, conditionVersion: "old-version", status: "breached", dataState: "fresh", explanation: "old", evaluatedAt: "2026-08-10T14:00:00Z", changed: true });
  const service = new MonitorRunService({ store, snapshotClient: { load: async (input) => {
    expect(input.requirements.map(({ symbol }) => symbol)).toEqual(["MSFT", "NVDA"]);
    return { snapshots: new Map([["NVDA", snapshot(170)], ["MSFT", { ...snapshot(170), symbol: "MSFT" }]]), provenance: { dataState: "fresh", sources: ["alpaca"], generatedAt: input.evaluatedAt } };
  } } });
  await service.run(run("2026-08-10T10:05-04:00"), "2026-08-10T14:07:00Z");
  expect(store.evaluations.filter((item) => item.conditionId === condition.id && item.conditionVersion === "version-1").at(-1)).toMatchObject({ previousStatus: undefined, status: "confirmed" });
});
