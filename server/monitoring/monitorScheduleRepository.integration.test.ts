// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { MonitorScheduleRepository } from "./monitorScheduleRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new MonitorScheduleRepository(database);

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("monitor.run").execute();
  await database.deleteFrom("monitor.schedule_state").execute();
});
afterAll(() => database.destroy());

test("competing scheduler instances converge on one natural-period run claim", async () => {
  const required = { type: "price" as const, naturalPeriod: "2026-08-10T10:05-04:00", scheduledFor: "2026-08-10T14:05:00.000Z", catchUp: true };
  const claims = await Promise.all([repository.claim(required), repository.claim(required)]);

  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await repository.listRuns()).toHaveLength(1);
});

test("successful runs advance schedule state while failed runs do not", async () => {
  const required = { type: "financial" as const, naturalPeriod: "2026-08-10", scheduledFor: "2026-08-10T22:00:00.000Z", catchUp: true };
  const claim = await repository.claim(required);
  await repository.start(claim!.id, new Date("2026-08-10T22:01:00.000Z"));
  await repository.complete(claim!.id, { dataState: "fresh", diagnostics: { symbols: 4 }, at: new Date("2026-08-10T22:02:00.000Z") });
  expect(await repository.lastSuccess()).toMatchObject({ financial: "2026-08-10" });

  const failed = await repository.claim({ ...required, naturalPeriod: "2026-08-11", scheduledFor: "2026-08-11T22:00:00.000Z" });
  await repository.fail(failed!.id, { diagnostics: { reason: "provider" }, at: new Date("2026-08-11T22:02:00.000Z") });
  expect(await repository.lastSuccess()).toMatchObject({ financial: "2026-08-10" });
});
