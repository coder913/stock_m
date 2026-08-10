import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { ConditionEvaluation, EvaluationDataState, MonitorAlert, MonitorRunResult, MonitorSnapshot, MonitorSnapshotRequest, ThesisCondition } from "../../shared/monitoring";
import { evaluateCondition } from "../../shared/monitoring/conditionEvaluator";
import type { Database } from "../db/types";
import type { OutboxRepository } from "../platform/outboxRepository";
import type { PostgresThesisRepository } from "../thesis/thesisRepository";
import type { LoadedMonitorSnapshots } from "./internalSnapshotClient";
import type { ClaimedMonitorRun, MonitorScheduleRepository } from "./monitorScheduleRepository";
import type { PostgresMonitorStateRepository } from "./monitorStateRepository";
import type { MonitorRunType } from "./scheduleDomain";

const intradayMetrics = new Set(["price", "dailyChangePercent", "priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d"]);

function belongsToRun(condition: ThesisCondition, runType: MonitorRunType): boolean {
  if (condition.kind === "event") return runType === "event";
  return runType === (intradayMetrics.has(condition.metric) ? "price" : "financial");
}

export function batchRequirements(conditions: ThesisCondition[]): MonitorSnapshotRequest["requirements"] {
  const grouped = new Map<string, MonitorSnapshotRequest["requirements"][number]>();
  for (const condition of conditions) {
    const symbol = condition.symbol.toUpperCase();
    const requirement = grouped.get(symbol) ?? { symbol, metrics: [], eventWindows: [] };
    if (condition.kind === "metric" && !requirement.metrics.includes(condition.metric)) requirement.metrics.push(condition.metric);
    if (condition.kind === "event") requirement.eventWindows.push({ eventType: condition.eventType, ...(condition.occurrence === "within-range" && condition.from ? { from: condition.from } : { from: condition.createdAt.slice(0, 10) }), to: condition.to });
    grouped.set(symbol, requirement);
  }
  return [...grouped.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export interface MonitorRunStore {
  listActiveForRun(type: MonitorRunType): Promise<ThesisCondition[]>;
  latestEffective(conditionId: string, conditionVersion: string): Promise<ConditionEvaluation | undefined>;
  start(run: ClaimedMonitorRun, at: Date): Promise<void>;
  commit(run: ClaimedMonitorRun, evaluations: ConditionEvaluation[], alerts: MonitorAlert[], dataState: "fresh" | "stale" | "unavailable", at: Date): Promise<void>;
  fail(run: ClaimedMonitorRun, error: unknown, at: Date): Promise<void>;
}

interface SnapshotClient { load(input: MonitorSnapshotRequest): Promise<LoadedMonitorSnapshots>; }

export class PostgresMonitorRunStore implements MonitorRunStore {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly theses: PostgresThesisRepository,
    private readonly monitoring: PostgresMonitorStateRepository,
    private readonly schedules: MonitorScheduleRepository,
    private readonly outbox: OutboxRepository,
  ) {}

  async listActiveForRun(type: MonitorRunType): Promise<ThesisCondition[]> {
    const latest = await this.theses.listLatest();
    const groups = await Promise.all(latest.map(async (thesis) => ({ thesis, review: await this.monitoring.latestReview(thesis.id), conditions: await this.theses.listConditions(thesis.id) })));
    return groups.filter(({ review }) => review?.decision !== "archived").flatMap(({ conditions }) => conditions).filter((condition) => belongsToRun(condition, type));
  }

  latestEffective(conditionId: string, conditionVersion: string): Promise<ConditionEvaluation | undefined> {
    return this.monitoring.latestEffective(conditionId, conditionVersion);
  }

  async start(run: ClaimedMonitorRun, at: Date): Promise<void> { await this.schedules.start(run.id, at); }

  async commit(run: ClaimedMonitorRun, evaluations: ConditionEvaluation[], alerts: MonitorAlert[], dataState: "fresh" | "stale" | "unavailable", at: Date): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      for (const evaluation of evaluations) await this.monitoring.recordEvaluation(evaluation, transaction);
      for (const alert of alerts) {
        const recorded = await this.monitoring.recordAlertWithResult(alert, transaction);
        if (recorded.inserted) await this.outbox.append(transaction, { id: randomUUID(), topic: "monitor.alert.created", aggregateId: recorded.alert.id, payloadJson: recorded.alert, occurredAt: at });
      }
      await this.schedules.complete(run.id, { dataState, diagnostics: { conditions: evaluations.length, alerts: alerts.length }, at }, transaction);
    });
  }

  async fail(run: ClaimedMonitorRun, error: unknown, at: Date): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown monitor run failure";
    await this.schedules.fail(run.id, { diagnostics: { message }, at });
  }
}

function missingSnapshot(symbol: string, now: string): MonitorSnapshot {
  return { symbol, metrics: {}, events: [], eventsState: "unavailable", generatedAt: now };
}

function aggregateState(evaluations: ConditionEvaluation[]): "fresh" | "stale" | "unavailable" {
  const states = new Set<EvaluationDataState>(evaluations.map(({ dataState }) => dataState));
  if (states.has("unavailable")) return "unavailable";
  if (states.has("stale") || states.has("missing")) return "stale";
  return "fresh";
}

export class MonitorRunService {
  constructor(private readonly dependencies: { store: MonitorRunStore; snapshotClient: SnapshotClient }) {}

  async run(run: ClaimedMonitorRun, evaluatedAt = new Date().toISOString()): Promise<MonitorRunResult> {
    const at = new Date(evaluatedAt);
    await this.dependencies.store.start(run, at);
    try {
      const conditions = await this.dependencies.store.listActiveForRun(run.type);
      if (!conditions.length) {
        await this.dependencies.store.commit(run, [], [], "fresh", at);
        return { conditions: [], alertsCreated: 0, warnings: [] };
      }
      const loaded = await this.dependencies.snapshotClient.load({ requirements: batchRequirements(conditions), evaluatedAt });
      const evaluations: ConditionEvaluation[] = [];
      const alerts: MonitorAlert[] = [];
      const warnings: string[] = [];
      for (const condition of conditions) {
        const version = condition.conditionVersion!;
        const previous = await this.dependencies.store.latestEffective(condition.id, version);
        const snapshot = loaded.snapshots.get(condition.symbol.toUpperCase()) ?? missingSnapshot(condition.symbol.toUpperCase(), evaluatedAt);
        if (!loaded.snapshots.has(condition.symbol.toUpperCase())) warnings.push(`${condition.symbol.toUpperCase()} is missing a monitor snapshot`);
        const evaluation = evaluateCondition({ condition, snapshot, previousDecisive: previous, now: evaluatedAt });
        evaluations.push(evaluation);
        const fromStatus = previous?.status ?? "pending";
        if (evaluation.dataState === "fresh" && evaluation.status !== "pending" && evaluation.status !== fromStatus) {
          alerts.push({ id: randomUUID(), dedupeKey: `${condition.id}:${version}:${fromStatus}:${evaluation.status}:${run.naturalPeriod}`, symbol: condition.symbol.toUpperCase(), thesisVersionId: condition.thesisVersionId, conditionId: condition.id, conditionVersion: version, fromStatus, toStatus: evaluation.status, severity: condition.severity, title: `${condition.symbol.toUpperCase()} ${condition.name}`, explanation: evaluation.explanation, asOf: evaluation.asOf, createdAt: evaluatedAt });
        }
      }
      await this.dependencies.store.commit(run, evaluations, alerts, aggregateState(evaluations), at);
      return { conditions: evaluations, alertsCreated: alerts.length, warnings };
    } catch (error) {
      await this.dependencies.store.fail(run, error, at);
      throw error;
    }
  }
}
