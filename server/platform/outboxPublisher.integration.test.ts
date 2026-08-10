// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { OutboxPublisher } from "./outboxPublisher";
import { OutboxRepository } from "./outboxRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const outbox = new OutboxRepository();

beforeAll(() => migrateToLatest(database));
beforeEach(() => database.deleteFrom("platform.outbox_event").execute());
afterAll(() => database.destroy());

test("publishes an outbox row once and marks it only after the queue accepts it", async () => {
  const event = {
    id: "publish-event-1",
    topic: "thesis.changed",
    aggregateId: "NVDA",
    payloadJson: { version: 2 },
    occurredAt: new Date("2026-08-10T02:00:00Z"),
  };
  await outbox.append(database, event);
  const queue = { add: vi.fn(async () => ({ id: event.id })) };
  const publisher = new OutboxPublisher(database, outbox, queue);

  expect(await publisher.publishBatch(100)).toBe(1);
  expect(await publisher.publishBatch(100)).toBe(0);
  expect(queue.add).toHaveBeenCalledOnce();
  expect(queue.add).toHaveBeenCalledWith(event.topic, event.payloadJson, { jobId: event.id });
  expect((await database.selectFrom("platform.outbox_event").selectAll().executeTakeFirstOrThrow()).publishedAt).toBeInstanceOf(Date);
});

test("keeps a failed event unpublished and records the attempt", async () => {
  await outbox.append(database, {
    id: "publish-event-2",
    topic: "monitor.evaluate",
    aggregateId: "AMD",
    payloadJson: { symbol: "AMD" },
    occurredAt: new Date("2026-08-10T03:00:00Z"),
  });
  const queue = { add: vi.fn(async () => { throw new Error("redis unavailable"); }) };
  const publisher = new OutboxPublisher(database, outbox, queue);

  expect(await publisher.publishBatch(100)).toBe(0);
  const stored = await database.selectFrom("platform.outbox_event").selectAll().executeTakeFirstOrThrow();
  expect(stored).toMatchObject({ publishedAt: null, attempts: 1 });
});
