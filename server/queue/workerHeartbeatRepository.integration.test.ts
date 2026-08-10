// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { WorkerHeartbeatRepository } from "./workerHeartbeatRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const heartbeats = new WorkerHeartbeatRepository(database);
const now = new Date("2026-08-10T09:00:00.000Z");

beforeAll(() => migrateToLatest(database));
beforeEach(() => database.deleteFrom("platform.worker_heartbeat").execute());
afterAll(() => database.destroy());

test("heartbeat reports queue lag without storing redis credentials", async () => {
  await heartbeats.record({ worker: "monitor", state: "ready", queueLag: 3, at: now });

  const latest = await heartbeats.latest("monitor");
  expect(latest).toMatchObject({ worker: "monitor", state: "ready", queueLag: 3, at: now.toISOString() });
  expect(JSON.stringify(latest)).not.toContain("redis://");
});

test("record replaces the latest state for one worker without affecting another", async () => {
  await heartbeats.record({ worker: "monitor", state: "starting", queueLag: 0, at: now });
  await heartbeats.record({ worker: "notifications", state: "ready", queueLag: 2, at: now });
  await heartbeats.record({ worker: "monitor", state: "degraded", queueLag: 7, at: new Date("2026-08-10T09:01:00.000Z") });

  expect(await heartbeats.latest("monitor")).toMatchObject({ state: "degraded", queueLag: 7 });
  expect(await heartbeats.latest("notifications")).toMatchObject({ state: "ready", queueLag: 2 });
});
