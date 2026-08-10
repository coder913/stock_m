// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { consumeOnce, OutboxRepository } from "./outboxRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const outbox = new OutboxRepository();

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("platform.inbox_event").execute();
  await database.deleteFrom("platform.outbox_event").execute();
});
afterAll(() => database.destroy());

test("appends an event with its stable delivery identity", async () => {
  await outbox.append(database, {
    id: "event-1",
    topic: "watchlist.changed",
    aggregateId: "watchlist-1",
    payloadJson: { symbol: "NVDA" },
    occurredAt: new Date("2026-08-10T01:00:00Z"),
  });

  const stored = await database.selectFrom("platform.outbox_event").selectAll().executeTakeFirstOrThrow();
  expect(stored).toMatchObject({ id: "event-1", topic: "watchlist.changed", attempts: 0, publishedAt: null });
});

test("consumes a duplicate event only once", async () => {
  const effect = vi.fn(async () => undefined);

  const first = await database.transaction().execute((transaction) =>
    consumeOnce(transaction, "monitor-worker", "event-1", effect));
  const second = await database.transaction().execute((transaction) =>
    consumeOnce(transaction, "monitor-worker", "event-1", effect));

  expect(first).toBe(true);
  expect(second).toBe(false);
  expect(effect).toHaveBeenCalledTimes(1);
});
