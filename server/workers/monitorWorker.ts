import { pathToFileURL } from "node:url";
import { UnrecoverableError, type Job } from "bullmq";
import { loadServerConfig } from "../config";
import { OutboxRepository } from "../platform/outboxRepository";
import { InternalSnapshotClient, InternalSnapshotError } from "../monitoring/internalSnapshotClient";
import { MonitorRunService, PostgresMonitorRunStore } from "../monitoring/monitorRunService";
import { MonitorScheduleRepository, type ClaimedMonitorRun } from "../monitoring/monitorScheduleRepository";
import { MonitorScheduler } from "../monitoring/monitorScheduler";
import { PostgresMonitorStateRepository } from "../monitoring/monitorStateRepository";
import { createUsEquityMarketCalendar } from "../monitoring/scheduleDomain";
import { queueNames } from "../queue/queueNames";
import { PostgresThesisRepository } from "../thesis/thesisRepository";
import { runWorker } from "./workerRuntime";

interface Scheduler { reconcile(): Promise<unknown>; }
interface RunService { run(input: ClaimedMonitorRun): Promise<unknown>; }

export function createMonitorJobProcessor(scheduler: Scheduler, service: RunService): (job: Job) => Promise<void> {
  return async (job) => {
    if (job.name === "monitor-schedule-tick") { await scheduler.reconcile(); return; }
    if (job.name !== "monitor-run") throw new UnrecoverableError(`Unsupported monitor job: ${job.name}`);
    try { await service.run(job.data as ClaimedMonitorRun); }
    catch (error) {
      if (!(error instanceof InternalSnapshotError) || !error.retryable) throw new UnrecoverableError(error instanceof Error ? error.message : "Deterministic monitor run failure");
      throw error;
    }
  };
}

export async function startMonitorWorker(): Promise<void> {
  const config = loadServerConfig(process.env);
  await runWorker({
    worker: "monitor",
    queueName: queueNames.monitorRuns,
    concurrency: config.workers.monitorConcurrency,
    initialize: async ({ config: runtimeConfig, database, queue }) => {
      const schedules = new MonitorScheduleRepository(database);
      const scheduler = new MonitorScheduler({ repository: schedules, queue, calendar: createUsEquityMarketCalendar() });
      const service = new MonitorRunService({
        store: new PostgresMonitorRunStore(database, new PostgresThesisRepository(database), new PostgresMonitorStateRepository(database), schedules, new OutboxRepository()),
        snapshotClient: new InternalSnapshotClient(runtimeConfig.internalApiBaseUrl, runtimeConfig.internalServiceToken),
      });
      await scheduler.start();
      return createMonitorJobProcessor(scheduler, service);
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startMonitorWorker();
}
