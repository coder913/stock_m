// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { MonitorSnapshot } from "../../shared/monitoring";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresMonitorStateRepository } from "./monitorStateRepository";
import { MonitorRunService, PostgresMonitorRunStore } from "./monitorRunService";
import { MonitorScheduleRepository } from "./monitorScheduleRepository";
import { PostgresThesisRepository } from "../thesis/thesisRepository";
import { OutboxRepository } from "../platform/outboxRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const now = new Date("2026-08-10T14:07:00.000Z");

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("platform.outbox_event").execute();
  await database.deleteFrom("monitor.condition_evaluation").execute();
  await database.deleteFrom("monitor.alert_action").execute();
  await database.deleteFrom("monitor.alert").execute();
  await database.deleteFrom("monitor.thesis_review").execute();
  await database.deleteFrom("monitor.run").execute();
  await database.deleteFrom("monitor.schedule_state").execute();
  await database.deleteFrom("core.thesis_condition").execute();
  await database.deleteFrom("core.thesis_version").execute();

  await database.insertInto("core.thesis_version").values({ id: "thesis-1", symbol: "NVDA", version: 1, coreJudgment: "growth", evidenceJson: JSON.stringify(["demand"]), risksJson: JSON.stringify(["valuation"]), validationConditionsJson: JSON.stringify(["price"]), createdAt: now }).execute();
  await database.insertInto("core.thesis_condition").values({
    id: "condition-price", thesisVersionId: "thesis-1", symbol: "NVDA", kind: "metric", name: "valuation risk", direction: "risk", severity: "high", deadline: null, note: null,
    specJson: JSON.stringify({ id: "condition-price", kind: "metric", name: "valuation risk", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" }),
    conditionVersion: "version-1", createdAt: now, updatedAt: now, deletedAt: null,
  }).execute();
});
afterAll(() => database.destroy());

test("commits evaluation, unique alert, outbox event, and run success in one durable workflow", async () => {
  const schedules = new MonitorScheduleRepository(database, () => now);
  const claimed = await schedules.claim({ type: "price", naturalPeriod: "2026-08-10T10:05-04:00", scheduledFor: "2026-08-10T14:05:00.000Z", catchUp: true });
  const snapshot: MonitorSnapshot = { symbol: "NVDA", metrics: { price: { value: 190, source: "alpaca", asOf: "2026-08-10T14:05:00Z", dataState: "fresh", notices: [] } }, events: [], eventsState: "fresh", generatedAt: now.toISOString() };
  const store = new PostgresMonitorRunStore(database, new PostgresThesisRepository(database), new PostgresMonitorStateRepository(database), schedules, new OutboxRepository());
  const service = new MonitorRunService({ store, snapshotClient: { load: async () => ({ snapshots: new Map([["NVDA", snapshot]]), provenance: { dataState: "fresh", sources: ["alpaca"], generatedAt: now.toISOString() } }) } });

  await service.run(claimed!, now.toISOString());
  await service.run(claimed!, now.toISOString());

  expect(await database.selectFrom("monitor.condition_evaluation").selectAll().execute()).toHaveLength(1);
  expect(await database.selectFrom("monitor.alert").selectAll().execute()).toHaveLength(1);
  expect(await database.selectFrom("platform.outbox_event").selectAll().where("topic", "=", "monitor.alert.created").execute()).toHaveLength(1);
  expect(await database.selectFrom("monitor.run").select(["status", "dataState"]).where("id", "=", claimed!.id).executeTakeFirst()).toEqual({ status: "succeeded", dataState: "fresh" });
});
