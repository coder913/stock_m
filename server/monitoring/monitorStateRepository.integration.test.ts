// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresMonitorStateRepository } from "./monitorStateRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresMonitorStateRepository(database, () => new Date("2026-08-10T09:00:00Z"));
const alert = { id: "alert-1", dedupeKey: "thesis-1:condition-1:deadbeef:breached:2026-08-10", symbol: "NVDA", thesisVersionId: "thesis-1", conditionId: "condition-1", conditionVersion: "deadbeef", fromStatus: "confirmed" as const, toStatus: "breached" as const, severity: "high" as const, title: "NVDA valuation", explanation: "price crossed target", asOf: "2026-08-10T08:00:00.000Z", createdAt: "2026-08-10T08:01:00.000Z" };

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("monitor.condition_evaluation").execute();
  await database.deleteFrom("monitor.alert_action").execute();
  await database.deleteFrom("monitor.alert").execute();
});
afterAll(() => database.destroy());

test("appends alert actions without rewriting the alert fact", async () => {
  await repository.recordAlert(alert);
  await repository.act(alert.id, { type: "snooze", until: "2026-08-12T00:00:00Z" });
  expect((await repository.getAlert(alert.id)).createdAt).toBe(alert.createdAt);
  expect(await repository.listAlertActions(alert.id)).toHaveLength(1);
  expect((await repository.listAlerts({ view: "snoozed", now: "2026-08-10T10:00:00Z" }))[0]).toMatchObject({ id: alert.id, snoozedUntil: "2026-08-12T00:00:00.000Z" });
});

test("deduplicates immutable alert facts", async () => {
  const first = await repository.recordAlert(alert);
  const second = await repository.recordAlert({ ...alert, id: "alert-2" });
  expect(second).toEqual(first);
  expect(await repository.listAlerts({ view: "pending", now: "2026-08-10T10:00:00Z" })).toHaveLength(1);
});

test("deduplicates evaluations even when as-of is absent", async () => {
  const evaluation = { id: "evaluation-1", conditionId: "condition-1", conditionVersion: "deadbeef", status: "pending" as const, dataState: "missing" as const, explanation: "missing", evaluatedAt: "2026-08-10T08:00:00.000Z", changed: false };
  expect((await repository.recordEvaluation(evaluation)).inserted).toBe(true);
  expect((await repository.recordEvaluation({ ...evaluation, id: "evaluation-2" })).inserted).toBe(false);
  expect(await repository.listEvaluations("condition-1")).toHaveLength(1);
});
