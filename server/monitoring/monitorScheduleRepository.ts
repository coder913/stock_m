import { randomUUID } from "node:crypto";
import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, MonitorRunTable } from "../db/types";
import type { MonitorRunType, RequiredRun } from "./scheduleDomain";

export interface ClaimedMonitorRun extends RequiredRun {
  id: string;
  status: "claimed" | "running" | "succeeded" | "failed";
  dataState?: "fresh" | "stale" | "unavailable";
}
type Executor = Transaction<Database>;

function mapRun(row: Selectable<MonitorRunTable>): ClaimedMonitorRun {
  return {
    id: row.id,
    type: row.runType,
    naturalPeriod: row.naturalPeriod,
    scheduledFor: row.scheduledFor.toISOString(),
    catchUp: row.catchUp,
    status: row.status,
    dataState: row.dataState ?? undefined,
  };
}

export class MonitorScheduleRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  async claim(required: RequiredRun): Promise<ClaimedMonitorRun | undefined> {
    const row = await this.database
      .insertInto("monitor.run")
      .values({
        id: randomUUID(),
        runType: required.type,
        naturalPeriod: required.naturalPeriod,
        scheduledFor: new Date(required.scheduledFor),
        catchUp: required.catchUp,
        status: "claimed",
        dataState: null,
        diagnosticsJson: {},
        createdAt: this.now(),
        startedAt: null,
        finishedAt: null,
      })
      .onConflict((conflict) => conflict.columns(["runType", "naturalPeriod"]).doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? mapRun(row) : undefined;
  }

  async start(id: string, at = this.now()): Promise<void> {
    await this.database.updateTable("monitor.run").set({ status: "running", startedAt: at }).where("id", "=", id).execute();
  }

  async complete(id: string, input: { dataState: "fresh" | "stale" | "unavailable"; diagnostics: unknown; at?: Date }, executor?: Executor): Promise<void> {
    const at = input.at ?? this.now();
    await this.inTransaction(executor, async (transaction) => {
      const run = await transaction.selectFrom("monitor.run").select(["runType", "naturalPeriod"]).where("id", "=", id).executeTakeFirstOrThrow();
      await transaction.updateTable("monitor.run").set({ status: "succeeded", dataState: input.dataState, diagnosticsJson: input.diagnostics, finishedAt: at }).where("id", "=", id).execute();
      await transaction.insertInto("monitor.schedule_state").values({ runType: run.runType, lastSuccessNaturalPeriod: run.naturalPeriod, lastSuccessAt: at, updatedAt: at })
        .onConflict((conflict) => conflict.column("runType").doUpdateSet({ lastSuccessNaturalPeriod: run.naturalPeriod, lastSuccessAt: at, updatedAt: at }))
        .execute();
    });
  }

  async fail(id: string, input: { diagnostics: unknown; at?: Date }): Promise<void> {
    await this.database.updateTable("monitor.run").set({ status: "failed", diagnosticsJson: input.diagnostics, finishedAt: input.at ?? this.now() }).where("id", "=", id).execute();
  }

  async lastSuccess(): Promise<Partial<Record<MonitorRunType, string>>> {
    const rows = await this.database.selectFrom("monitor.schedule_state").select(["runType", "lastSuccessNaturalPeriod"]).execute();
    return Object.fromEntries(rows.map((row) => [row.runType, row.lastSuccessNaturalPeriod]));
  }

  async listRuns(): Promise<ClaimedMonitorRun[]> {
    return (await this.database.selectFrom("monitor.run").selectAll().orderBy("scheduledFor").execute()).map(mapRun);
  }

  private inTransaction<T>(executor: Executor | undefined, action: (transaction: Executor) => Promise<T>): Promise<T> {
    return executor ? action(executor) : this.database.transaction().execute(action);
  }
}
