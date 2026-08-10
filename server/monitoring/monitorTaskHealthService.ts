import type { Kysely } from "kysely";
import type { MonitorTaskHealthView } from "../../shared/monitoring";
import type { Database } from "../db/types";

export class MonitorTaskHealthService {
  constructor(private readonly database: Kysely<Database>) {}
  async get(): Promise<MonitorTaskHealthView> {
    const [heartbeat, schedules, runs] = await Promise.all([
      this.database.selectFrom("platform.worker_heartbeat").selectAll().where("worker", "=", "monitor").executeTakeFirst(),
      this.database.selectFrom("monitor.schedule_state").selectAll().execute(),
      this.database.selectFrom("monitor.run").selectAll().orderBy("scheduledFor", "desc").execute(),
    ]);
    return {
      ...(heartbeat ? { worker: { state: heartbeat.state, queueLag: heartbeat.queueLag, heartbeatAt: heartbeat.heartbeatAt.toISOString() } } : {}),
      groups: (["price", "financial", "event"] as const).map((type) => {
        const schedule = schedules.find((item) => item.runType === type);
        const run = runs.find((item) => item.runType === type);
        return { type, ...(schedule ? { lastSuccess: schedule.lastSuccessNaturalPeriod } : {}), ...(run ? { nextRun: run.scheduledFor.toISOString(), status: run.status, ...(run.dataState ? { dataState: run.dataState } : {}) } : {}) };
      }),
    };
  }
}
