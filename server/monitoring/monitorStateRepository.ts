import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { AlertActionInput, AlertListQuery, ConditionEvaluation, MonitorAlert, MonitorAlertAction, ReviewInput, ThesisReview } from "../../shared/monitoring";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";

type Executor = Transaction<Database>;
export class PostgresMonitorStateRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  async recordEvaluation(evaluation: ConditionEvaluation, executor: Kysely<Database> | Executor = this.database): Promise<{ evaluation: ConditionEvaluation; inserted: boolean }> {
    const dedupeKey = `${evaluation.conditionId}:${evaluation.conditionVersion}:${evaluation.dataState}:${evaluation.status}:${evaluation.asOf ?? ""}`;
    const inserted = await executor.insertInto("monitor.condition_evaluation").values({ id: evaluation.id, conditionId: evaluation.conditionId, conditionVersion: evaluation.conditionVersion, dedupeKey, status: evaluation.status, dataState: evaluation.dataState, actualValueJson: evaluation.actualValue === undefined ? null : JSON.stringify(evaluation.actualValue), targetValueJson: evaluation.targetValue === undefined ? null : JSON.stringify(evaluation.targetValue), source: evaluation.source ?? null, asOf: evaluation.asOf ?? null, explanation: evaluation.explanation, evaluatedAt: evaluation.evaluatedAt, changed: evaluation.changed, previousStatus: evaluation.previousStatus ?? null })
      .onConflict((conflict) => conflict.column("dedupeKey").doNothing()).returningAll().executeTakeFirst();
    if (inserted) return { evaluation: this.mapEvaluation(inserted), inserted: true };
    const existing = await executor.selectFrom("monitor.condition_evaluation").selectAll().where("dedupeKey", "=", dedupeKey).executeTakeFirstOrThrow();
    return { evaluation: this.mapEvaluation(existing), inserted: false };
  }
  async listEvaluations(conditionId: string): Promise<ConditionEvaluation[]> {
    const rows = await this.database.selectFrom("monitor.condition_evaluation").selectAll().where("conditionId", "=", conditionId).orderBy("evaluatedAt", "asc").execute();
    return rows.map((row) => this.mapEvaluation(row));
  }
  async latestEvaluation(conditionId: string): Promise<ConditionEvaluation | undefined> {
    const row = await this.database.selectFrom("monitor.condition_evaluation").selectAll().where("conditionId", "=", conditionId).orderBy("evaluatedAt", "desc").executeTakeFirst();
    return row ? this.mapEvaluation(row) : undefined;
  }
  async latestEffective(conditionId: string, conditionVersion: string, executor: Kysely<Database> | Executor = this.database): Promise<ConditionEvaluation | undefined> {
    const row = await executor.selectFrom("monitor.condition_evaluation").selectAll()
      .where("conditionId", "=", conditionId).where("conditionVersion", "=", conditionVersion).where("dataState", "=", "fresh")
      .orderBy("evaluatedAt", "desc").executeTakeFirst();
    return row ? this.mapEvaluation(row) : undefined;
  }

  async recordAlert(alert: MonitorAlert, executor: Kysely<Database> | Executor = this.database): Promise<MonitorAlert> {
    return (await this.recordAlertWithResult(alert, executor)).alert;
  }
  async recordAlertWithResult(alert: MonitorAlert, executor: Kysely<Database> | Executor = this.database): Promise<{ alert: MonitorAlert; inserted: boolean }> {
    const inserted = await executor.insertInto("monitor.alert").values({ id: alert.id, dedupeKey: alert.dedupeKey, symbol: alert.symbol.toUpperCase(), thesisVersionId: alert.thesisVersionId, conditionId: alert.conditionId, conditionVersion: alert.conditionVersion, fromStatus: alert.fromStatus ?? null, toStatus: alert.toStatus, severity: alert.severity, title: alert.title, explanation: alert.explanation, asOf: alert.asOf ?? null, createdAt: alert.createdAt }).onConflict((conflict) => conflict.column("dedupeKey").doNothing()).returningAll().executeTakeFirst();
    if (inserted) return { alert: this.mapAlert(inserted), inserted: true };
    const row = await executor.selectFrom("monitor.alert").selectAll().where("dedupeKey", "=", alert.dedupeKey).executeTakeFirstOrThrow();
    return { alert: this.withActionState(this.mapAlert(row), await this.listAlertActions(row.id, executor)), inserted: false };
  }
  async getAlert(id: string): Promise<MonitorAlert> {
    const row = await this.database.selectFrom("monitor.alert").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw new ApiError("ALERT_NOT_FOUND", "未找到监控提醒", 404, false);
    return this.withActionState(this.mapAlert(row), await this.listAlertActions(id));
  }
  async listAlerts(query: AlertListQuery): Promise<MonitorAlert[]> {
    let builder = this.database.selectFrom("monitor.alert").selectAll();
    if (query.symbol) builder = builder.where("symbol", "=", query.symbol.toUpperCase());
    if (query.severity) builder = builder.where("severity", "=", query.severity);
    if (query.toStatus) builder = builder.where("toStatus", "=", query.toStatus);
    if (query.from) builder = builder.where("createdAt", ">=", new Date(`${query.from}T00:00:00.000Z`));
    if (query.to) builder = builder.where("createdAt", "<=", new Date(`${query.to}T23:59:59.999Z`));
    const facts = await builder.orderBy("createdAt", "desc").execute();
    const alerts = await Promise.all(facts.map(async (row) => this.withActionState(this.mapAlert(row), await this.listAlertActions(row.id))));
    return alerts.filter((alert) => query.view === "archived" ? Boolean(alert.archivedAt) : query.view === "snoozed" ? !alert.archivedAt && Boolean(alert.snoozedUntil && alert.snoozedUntil > query.now) : !alert.archivedAt && !(alert.snoozedUntil && alert.snoozedUntil > query.now));
  }
  async act(alertId: string, action: AlertActionInput, executor?: Executor): Promise<MonitorAlertAction> {
    return this.inTransaction(executor, async (transaction) => {
      const exists = await transaction.selectFrom("monitor.alert").select("id").where("id", "=", alertId).executeTakeFirst();
      if (!exists) throw new ApiError("ALERT_NOT_FOUND", "未找到监控提醒", 404, false);
      const createdAt = this.now();
      const row = await transaction.insertInto("monitor.alert_action").values({ id: randomUUID(), alertId, type: action.type, untilAt: action.type === "snooze" ? action.until : null, createdAt }).returningAll().executeTakeFirstOrThrow();
      return this.mapAction(row);
    });
  }
  async listAlertActions(alertId: string, executor: Kysely<Database> | Executor = this.database): Promise<MonitorAlertAction[]> {
    const rows = await executor.selectFrom("monitor.alert_action").selectAll().where("alertId", "=", alertId).orderBy("ordinal", "asc").execute();
    return rows.map((row) => this.mapAction(row));
  }

  async recordReview(input: ReviewInput, executor: Kysely<Database> | Executor = this.database): Promise<ThesisReview> {
    const row = await executor.insertInto("monitor.thesis_review").values({ id: input.id ?? randomUUID(), thesisVersionId: input.thesisVersionId, symbol: input.symbol.toUpperCase(), decision: input.decision, note: input.note ?? null, conditionSnapshotJson: JSON.stringify(input.conditionSnapshot), createdAt: input.createdAt ?? this.now() }).returningAll().executeTakeFirstOrThrow();
    return this.mapReview(row);
  }
  async listReviews(thesisVersionId: string): Promise<ThesisReview[]> {
    const rows = await this.database.selectFrom("monitor.thesis_review").selectAll().where("thesisVersionId", "=", thesisVersionId).orderBy("createdAt", "asc").execute();
    return rows.map((row) => this.mapReview(row));
  }
  async latestReview(thesisVersionId: string): Promise<ThesisReview | undefined> { const items = await this.listReviews(thesisVersionId); return items.at(-1); }

  private withActionState(alert: MonitorAlert, actions: MonitorAlertAction[]): MonitorAlert {
    let state = { ...alert };
    for (const action of actions) {
      if (action.type === "read") state.readAt = action.createdAt;
      if (action.type === "snooze") state.snoozedUntil = action.until;
      if (action.type === "archive") state.archivedAt = action.createdAt;
      if (action.type === "restore") { delete state.archivedAt; delete state.snoozedUntil; }
    }
    return state;
  }
  private mapEvaluation(row: Database["monitor.condition_evaluation"] extends infer _ ? any : never): ConditionEvaluation { return { id: row.id, conditionId: row.conditionId, conditionVersion: row.conditionVersion, status: row.status, dataState: row.dataState, ...(row.actualValueJson === null ? {} : { actualValue: row.actualValueJson }), ...(row.targetValueJson === null ? {} : { targetValue: row.targetValueJson }), ...(row.source ? { source: row.source } : {}), ...(row.asOf ? { asOf: row.asOf.toISOString() } : {}), explanation: row.explanation, evaluatedAt: row.evaluatedAt.toISOString(), changed: row.changed, ...(row.previousStatus ? { previousStatus: row.previousStatus } : {}) } as ConditionEvaluation; }
  private mapAlert(row: any): MonitorAlert { return { id: row.id, dedupeKey: row.dedupeKey, symbol: row.symbol, thesisVersionId: row.thesisVersionId, conditionId: row.conditionId, conditionVersion: row.conditionVersion, ...(row.fromStatus ? { fromStatus: row.fromStatus } : {}), toStatus: row.toStatus, severity: row.severity, title: row.title, explanation: row.explanation, ...(row.asOf ? { asOf: row.asOf.toISOString() } : {}), createdAt: row.createdAt.toISOString() }; }
  private mapAction(row: any): MonitorAlertAction { return { id: row.id, alertId: row.alertId, type: row.type, ...(row.untilAt ? { until: row.untilAt.toISOString() } : {}), createdAt: row.createdAt.toISOString() }; }
  private mapReview(row: any): ThesisReview { return { id: row.id, thesisVersionId: row.thesisVersionId, symbol: row.symbol, decision: row.decision, ...(row.note ? { note: row.note } : {}), conditionSnapshot: row.conditionSnapshotJson, createdAt: row.createdAt.toISOString() }; }
  private inTransaction<T>(executor: Executor | undefined, action: (transaction: Executor) => Promise<T>): Promise<T> { return executor ? action(executor) : this.database.transaction().execute(action); }
}
