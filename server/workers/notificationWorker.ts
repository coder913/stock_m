import { pathToFileURL } from "node:url";
import type { Job } from "bullmq";
import { loadServerConfig } from "../config";
import { queueNames } from "../queue/queueNames";
import { runWorker } from "./workerRuntime";

export async function processNotificationJob(_job: Job): Promise<void> {
  // Task 6 supplies the durable notification processor.
}

export async function startNotificationWorker(): Promise<void> {
  const config = loadServerConfig(process.env);
  await runWorker({
    worker: "notifications",
    queueName: queueNames.notifications,
    concurrency: config.workers.notificationConcurrency,
    process: processNotificationJob,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startNotificationWorker();
}
