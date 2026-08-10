// @vitest-environment node
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { OutboxPublisher } from "../platform/outboxPublisher";
import { OutboxRepository } from "../platform/outboxRepository";
import { createRedisConnection } from "../queue/redisConnection";
import { queueNames } from "../queue/queueNames";
import { createNotificationJobProcessor } from "../workers/notificationWorker";
import { NotificationRepository } from "./notificationRepository";
import { NotificationService } from "./notificationService";
import { PushSubscriptionRepository } from "./pushSubscriptionRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";
const queueConnection = createRedisConnection(redisUrl);
const workerConnection = createRedisConnection(redisUrl);
const queue = new Queue(queueNames.notifications, { connection: queueConnection });

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await workerConnection.flushdb();
  await database.deleteFrom("platform.inbox_event").execute();
  await database.deleteFrom("platform.outbox_event").execute();
  await database.deleteFrom("platform.dead_letter").execute();
  await database.deleteFrom("notification.delivery_attempt").execute();
  await database.deleteFrom("notification.delivery").execute();
  await database.deleteFrom("notification.push_subscription").execute();
});
afterAll(async () => { await queue.close(); await Promise.all([queueConnection.quit(), workerConnection.quit()]); await database.destroy(); });

async function waitForSuccess(alertId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const row = await database.selectFrom("notification.delivery").select("status").where("alertId", "=", alertId).executeTakeFirst();
    if (row?.status === "succeeded") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("notification delivery did not succeed before deadline");
}

test("rebuilds a lost Redis event from the transactional Outbox and delivers successfully once", async () => {
  const subscriptions = new PushSubscriptionRepository(database, Buffer.alloc(32, 4));
  await subscriptions.upsert({ endpoint: "https://push.example/recovery", expirationTime: null, keys: { p256dh: "key", auth: "auth" } }, "Chrome");
  const outbox = new OutboxRepository();
  const event = { id: "recovery-event-1", topic: "monitor.alert.created", aggregateId: "alert-recovery", payloadJson: { id: "alert-recovery", symbol: "NVDA", severity: "high", title: "风险条件触发", explanation: "价格跌破阈值" }, occurredAt: new Date() };
  await database.transaction().execute((transaction) => outbox.append(transaction, event));

  await workerConnection.flushdb();
  const send = vi.fn(async () => undefined);
  const service = new NotificationService({ repository: new NotificationRepository(database), subscriptions, provider: { send }, scheduler: { retry: (deliveryId, delay) => queue.add("notification-delivery", { deliveryId }, { delay }) } });
  const worker = new Worker(queueNames.notifications, createNotificationJobProcessor(service), { connection: workerConnection });
  await worker.waitUntilReady();
  const publisher = new OutboxPublisher(database, outbox, queue);
  expect(await publisher.publishBatch(10)).toBe(1);
  await waitForSuccess("alert-recovery");

  await database.updateTable("platform.outbox_event").set({ publishedAt: null }).where("id", "=", event.id).execute();
  expect(await publisher.publishBatch(10)).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(send).toHaveBeenCalledTimes(1);
  expect(await new NotificationRepository(database).countDeliveries("alert-recovery")).toBe(1);
  await worker.close();
});
