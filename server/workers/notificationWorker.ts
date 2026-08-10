import { pathToFileURL } from "node:url";
import type { Job } from "bullmq";
import { loadServerConfig } from "../config";
import { NotificationRepository } from "../notifications/notificationRepository";
import { NotificationService } from "../notifications/notificationService";
import { PushProvider } from "../notifications/pushProvider";
import { PushSubscriptionRepository } from "../notifications/pushSubscriptionRepository";
import { queueNames } from "../queue/queueNames";
import { runWorker } from "./workerRuntime";

interface NotificationProcessorService { consume(event: { eventId: string; topic: "monitor.alert.created" | "notification.test.requested"; payload: unknown }): Promise<void>; retry(deliveryId: string): Promise<void>; }

export function createNotificationJobProcessor(service?: NotificationProcessorService): (job: Job) => Promise<void> {
  return async (job) => {
    if (!service) return;
    if (job.name === "notification-delivery") { await service.retry(String((job.data as { deliveryId: unknown }).deliveryId)); return; }
    if (job.name === "monitor.alert.created" || job.name === "notification.test.requested") {
      await service.consume({ eventId: String(job.id), topic: job.name, payload: job.data });
    }
  };
}

export async function startNotificationWorker(): Promise<void> {
  const config = loadServerConfig(process.env);
  await runWorker({
    worker: "notifications",
    queueName: queueNames.notifications,
    concurrency: config.workers.notificationConcurrency,
    initialize: async ({ config: runtimeConfig, database, queue }) => {
      if (!runtimeConfig.notifications.configured || !runtimeConfig.secrets.push || !runtimeConfig.notifications.publicKey || !runtimeConfig.notifications.subject) return createNotificationJobProcessor();
      const subscriptions = new PushSubscriptionRepository(database, runtimeConfig.secrets.push.subscriptionEncryptionKey);
      const service = new NotificationService({
        repository: new NotificationRepository(database),
        subscriptions,
        provider: new PushProvider({ subject: runtimeConfig.notifications.subject, publicKey: runtimeConfig.notifications.publicKey, privateKey: runtimeConfig.secrets.push.privateKey }),
        scheduler: { retry: (deliveryId, delayMs) => queue.add("notification-delivery", { deliveryId }, { delay: delayMs }) },
      });
      return createNotificationJobProcessor(service);
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startNotificationWorker();
}
