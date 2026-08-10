// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PushSubscriptionRepository } from "./pushSubscriptionRepository";
import { NotificationRepository } from "./notificationRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const subscriptions = new PushSubscriptionRepository(database, Buffer.alloc(32, 2));
const repository = new NotificationRepository(database, () => new Date("2026-08-10T10:00:00Z"));
beforeAll(() => migrateToLatest(database));
beforeEach(async () => { await database.deleteFrom("platform.inbox_event").execute(); await database.deleteFrom("platform.dead_letter").execute(); await database.deleteFrom("notification.delivery_attempt").execute(); await database.deleteFrom("notification.delivery").execute(); await database.deleteFrom("notification.push_subscription").execute(); });
afterAll(() => database.destroy());

test("deduplicates by event inbox and by alert/subscription pair", async () => {
  const subscription = await subscriptions.upsert({ endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "key", auth: "auth" } }, "Chrome");
  const payload = { alertId: "alert-1", symbol: "NVDA", severity: "high" as const, title: "title", explanation: "body", url: "/stocks/NVDA?alert=alert-1" };
  await repository.prepare("event-1", "alert-1", payload, [subscription.id]);
  await repository.prepare("event-1", "alert-1", payload, [subscription.id]);
  await repository.prepare("event-2", "alert-1", payload, [subscription.id]);
  expect(await repository.countDeliveries("alert-1")).toBe(1);
});

test("records attempts, success, and dead letters durably", async () => {
  const subscription = await subscriptions.upsert({ endpoint: "https://push.example/two", expirationTime: null, keys: { p256dh: "key", auth: "auth" } }, "Chrome");
  const [delivery] = await repository.prepare("event-3", "alert-2", { alertId: "alert-2", symbol: "MSFT", severity: "low", title: "title", explanation: "body", url: "/stocks/MSFT" }, [subscription.id]);
  await repository.recordAttempt(delivery.id, { outcome: "retry", statusCode: 503, error: "unavailable" });
  await repository.markTerminal(delivery.id, "dead_letter", "retries exhausted", "event-3");
  expect((await repository.get(delivery.id))?.attemptCount).toBe(1);
  expect(await database.selectFrom("platform.dead_letter").selectAll().where("eventId", "=", "event-3").executeTakeFirst()).toBeTruthy();
});
