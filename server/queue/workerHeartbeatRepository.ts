import type { Kysely } from "kysely";
import type { Database } from "../db/types";

export type WorkerName = "monitor" | "notifications" | "trading";
export type WorkerState = "starting" | "ready" | "degraded" | "stopping";

export interface WorkerHeartbeatInput {
  worker: WorkerName;
  state: WorkerState;
  queueLag: number;
  at: Date;
}

export interface WorkerHeartbeat {
  worker: WorkerName;
  state: WorkerState;
  queueLag: number;
  at: string;
}

export class WorkerHeartbeatRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async record(input: WorkerHeartbeatInput): Promise<void> {
    await this.database
      .insertInto("platform.worker_heartbeat")
      .values({ worker: input.worker, state: input.state, queueLag: input.queueLag, heartbeatAt: input.at })
      .onConflict((conflict) => conflict.column("worker").doUpdateSet({
        state: input.state,
        queueLag: input.queueLag,
        heartbeatAt: input.at,
      }))
      .execute();
  }

  async latest(worker: WorkerName): Promise<WorkerHeartbeat | undefined> {
    const row = await this.database
      .selectFrom("platform.worker_heartbeat")
      .selectAll()
      .where("worker", "=", worker)
      .executeTakeFirst();
    return row ? {
      worker: row.worker,
      state: row.state,
      queueLag: row.queueLag,
      at: row.heartbeatAt.toISOString(),
    } : undefined;
  }
}
