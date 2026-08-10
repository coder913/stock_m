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
  initialize?: (context: { config: ServerConfig; database: Kysely<Database>; queue: Queue }) => Promise<(job: Job) => Promise<unknown>>;
  heartbeatIntervalMs?: number;
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
  let activeHeartbeat: Promise<void> | undefined;

  const recordHeartbeat = async (nextState = state): Promise<void> => {
    state = nextState;
    const queueLag = await queue.getWaitingCount();
    await heartbeats.record({ worker: options.worker, state, queueLag, at: new Date() });
  };

  await heartbeats.record({ worker: options.worker, state, queueLag: 0, at: new Date() });
  await Promise.all([queueConnection.ping(), workerConnection.ping()]);

  const processor = options.initialize ? await options.initialize({ config, database, queue }) : options.process;
  if (!processor) throw new Error(`Worker ${options.worker} has no processor`);

  const worker = new Worker(options.queueName, processor, {
    connection: workerConnection,
    concurrency: options.concurrency,
  });
  worker.on("error", () => { state = "degraded"; });
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

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      stopping = true;
      clearInterval(heartbeatTimer);
      await activeHeartbeat;
      await recordHeartbeat("stopping").catch(() => undefined);
      await worker.close();
      await queue.close();
      await Promise.all([disconnect(workerConnection), disconnect(queueConnection)]);
      await database.destroy();
    })();
    return shutdownPromise;
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}
