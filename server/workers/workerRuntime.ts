import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import type { Kysely } from "kysely";
import { loadServerConfig } from "../config";
import type { ServerConfig } from "../config";
import { createDatabase } from "../db/database";
import type { Database } from "../db/types";
import { migrateToLatest } from "../db/migrate";
import { createRedisConnection } from "../queue/redisConnection";
import { WorkerHeartbeatRepository, type WorkerName, type WorkerState } from "../queue/workerHeartbeatRepository";

interface WorkerRuntimeOptions {
  worker: WorkerName;
  queueName: string;
  concurrency: number;
  process?: (job: Job) => Promise<unknown>;
  initialize?: (context: { config: ServerConfig; database: Kysely<Database>; queue: Queue }) => Promise<WorkerProcessor | WorkerLifecycle>;
  heartbeatIntervalMs?: number;
}

type WorkerProcessor = (job: Job) => Promise<unknown>;

export interface WorkerLifecycle {
  process: WorkerProcessor;
  healthy?(): boolean;
  close?(): Promise<void>;
}

export function workerHeartbeatState(workerHealthy: boolean, componentHealthy: boolean): WorkerState {
  return workerHealthy && componentHealthy ? "ready" : "degraded";
}

interface WorkerShutdownHooks {
  stopHeartbeat(): void;
  waitForHeartbeat(): Promise<void>;
  recordStopping(): Promise<void>;
  closeLifecycle(): Promise<void>;
  closeWorker(): Promise<void>;
  closeQueue(): Promise<void>;
  disconnect(): Promise<void>;
  destroyDatabase(): Promise<void>;
}

export function createWorkerShutdown(hooks: WorkerShutdownHooks): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;
  return () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      let firstError: unknown;
      const run = async (operation: () => void | Promise<void>) => {
        try { await operation(); }
        catch (error) { firstError ??= error; }
      };
      await run(hooks.stopHeartbeat);
      await run(hooks.waitForHeartbeat);
      await run(hooks.recordStopping);
      await run(hooks.closeLifecycle);
      await run(hooks.closeWorker);
      await run(hooks.closeQueue);
      await run(hooks.disconnect);
      await run(hooks.destroyDatabase);
      if (firstError) throw firstError;
    })();
    return shutdownPromise;
  };
}

async function disconnect(connection: IORedis): Promise<void> {
  if (connection.status === "end") return;
  await connection.quit();
}

export async function runWorker(options: WorkerRuntimeOptions): Promise<void> {
  const config = loadServerConfig(process.env);
  const database = createDatabase(config.databaseUrl);
  await migrateToLatest(database);

  const heartbeats = new WorkerHeartbeatRepository(database);
  const queueConnection = createRedisConnection(config.redisUrl);
  const workerConnection = createRedisConnection(config.redisUrl);
  const queue = new Queue(options.queueName, { connection: queueConnection });
  let state: WorkerState = "starting";
  let stopping = false;
  let workerHealthy = true;
  let activeHeartbeat: Promise<void> | undefined;
  let lifecycle: WorkerLifecycle | undefined;

  const recordHeartbeat = async (nextState = state): Promise<void> => {
    state = nextState === "starting" || nextState === "stopping"
      ? nextState
      : workerHeartbeatState(workerHealthy, lifecycle?.healthy?.() ?? true);
    const queueLag = await queue.getWaitingCount();
    await heartbeats.record({ worker: options.worker, state, queueLag, at: new Date() });
  };

  await heartbeats.record({ worker: options.worker, state, queueLag: 0, at: new Date() });
  await Promise.all([queueConnection.ping(), workerConnection.ping()]);

  const initialized = options.initialize ? await options.initialize({ config, database, queue }) : options.process;
  if (!initialized) throw new Error(`Worker ${options.worker} has no processor`);
  lifecycle = typeof initialized === "function" ? { process: initialized } : initialized;

  const worker = new Worker(options.queueName, lifecycle.process, {
    connection: workerConnection,
    concurrency: options.concurrency,
  });
  worker.on("error", () => { workerHealthy = false; state = "degraded"; });
  worker.on("ready", () => { workerHealthy = true; });
  await worker.waitUntilReady();
  await recordHeartbeat("ready");

  const heartbeatTimer = setInterval(() => {
    if (activeHeartbeat || stopping) return;
    activeHeartbeat = recordHeartbeat().catch(async () => {
      state = "degraded";
      await heartbeats.record({ worker: options.worker, state, queueLag: 0, at: new Date() }).catch(() => undefined);
    }).finally(() => { activeHeartbeat = undefined; });
  }, options.heartbeatIntervalMs ?? 15_000);
  heartbeatTimer.unref?.();

  const shutdown = createWorkerShutdown({
    stopHeartbeat: () => { stopping = true; clearInterval(heartbeatTimer); },
    waitForHeartbeat: async () => { await activeHeartbeat; },
    recordStopping: () => recordHeartbeat("stopping").catch(() => undefined),
    closeLifecycle: async () => { await lifecycle?.close?.(); },
    closeWorker: () => worker.close(),
    closeQueue: () => queue.close(),
    disconnect: async () => { await Promise.all([disconnect(workerConnection), disconnect(queueConnection)]); },
    destroyDatabase: () => database.destroy(),
  });

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}
