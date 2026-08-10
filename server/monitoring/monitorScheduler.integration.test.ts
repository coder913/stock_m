// @vitest-environment node
import { Queue } from "bullmq";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { createRedisConnection } from "../queue/redisConnection";
import { createUsEquityMarketCalendar } from "./scheduleDomain";
import { MonitorScheduleRepository } from "./monitorScheduleRepository";
import { MonitorScheduler } from "./monitorScheduler";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const redis = createRedisConnection(process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379");
const queueName = `monitor-scheduler-${process.pid}`;
const queue = new Queue(queueName, { connection: redis });
const repository = new MonitorScheduleRepository(database);

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await queue.obliterate({ force: true });
  await database.deleteFrom("monitor.run").execute();
  await database.deleteFrom("monitor.schedule_state").execute();
});
afterAll(async () => { await queue.close(); await redis.quit(); await database.destroy(); });

test("startup creates repeatable ticks and enqueues one latest catch-up per group", async () => {
  const scheduler = new MonitorScheduler({
    repository,
    queue,
    calendar: createUsEquityMarketCalendar(),
    now: () => new Date("2026-08-10T22:20:00.000Z"),
  });

  const first = await scheduler.start();
  const second = await scheduler.start();
  expect(first.map(({ type }) => type).sort()).toEqual(["event", "financial"]);
  expect(second).toEqual([]);

  const jobs = await queue.getJobs(["waiting", "delayed"]);
  expect(jobs.filter(({ name }) => name === "monitor-run")).toHaveLength(2);
  expect(jobs.find(({ data }) => data.type === "event")?.id).toBe("monitor:event:2026-08-10");
  expect(await queue.getJobSchedulers()).toHaveLength(3);
});
