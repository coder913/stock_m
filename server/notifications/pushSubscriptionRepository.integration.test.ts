// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PushSubscriptionRepository } from "./pushSubscriptionRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PushSubscriptionRepository(database, Buffer.alloc(32, 9), () => new Date("2026-08-10T10:00:00Z"));
const subscription = { endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client-key", auth: "auth-secret" } };
beforeAll(() => migrateToLatest(database));
beforeEach(() => database.deleteFrom("notification.push_subscription").execute());
afterAll(() => database.destroy());

test("upserts by endpoint hash, reactivates revoked subscriptions, and never returns keys from status views", async () => {
  const first = await repository.upsert(subscription, "Chrome");
  await repository.revoke(first.endpointHash);
  const second = await repository.upsert({ ...subscription, keys: { ...subscription.keys, auth: "rotated" } }, "Chrome 2");
  expect(second.id).toBe(first.id);
  expect(second).not.toHaveProperty("endpoint");
  expect(JSON.stringify(second)).not.toContain("rotated");
  expect((await repository.loadActive()).map((item) => item.subscription.keys.auth)).toEqual(["rotated"]);
});

test("invalid subscriptions are excluded from active delivery", async () => {
  const saved = await repository.upsert(subscription, "Chrome");
  await repository.invalidate(saved.id);
  expect(await repository.loadActive()).toEqual([]);
});
