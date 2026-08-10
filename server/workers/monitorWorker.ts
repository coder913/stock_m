import { pathToFileURL } from "node:url";
import type { Job } from "bullmq";
import { loadServerConfig } from "../config";
import { queueNames } from "../queue/queueNames";
import { runWorker } from "./workerRuntime";

export async function processMonitorJob(_job: Job): Promise<void> {
  // Task 3 supplies the durable monitor-run processor.
}

export async function startMonitorWorker(): Promise<void> {
  const config = loadServerConfig(process.env);
  await runWorker({
    worker: "monitor",
    queueName: queueNames.monitorRuns,
    concurrency: config.workers.monitorConcurrency,
    process: processMonitorJob,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startMonitorWorker();
}
