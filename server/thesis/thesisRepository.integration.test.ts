// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresThesisRepository } from "./thesisRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresThesisRepository(database, () => new Date("2026-08-10T08:00:00Z"));
const draft = { symbol: "nvda", coreJudgment: "AI demand compounds", evidence: ["revenue"], risks: ["valuation"], validationConditions: ["earnings"] };

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("monitor.thesis_review").execute();
  await database.deleteFrom("monitor.alert_action").execute();
  await database.deleteFrom("monitor.alert").execute();
  await database.deleteFrom("monitor.condition_evaluation").execute();
  await database.deleteFrom("core.thesis_condition").execute();
  await database.deleteFrom("core.thesis_version").execute();
});
afterAll(() => database.destroy());

test("allocates thesis versions transactionally", async () => {
  const [left, right] = await Promise.all([repository.create(draft), repository.create(draft)]);
  expect([left.version, right.version].sort()).toEqual([1, 2]);
  expect((await repository.getLatest("NVDA"))?.version).toBe(2);
  expect((await repository.getHistory("nvda")).map((item) => item.version)).toEqual([1, 2]);
});

test("rejects adding conditions to a thesis version that is no longer current", async () => {
  const first = await repository.create(draft);
  await repository.create({ ...draft, coreJudgment: "new thesis" });

  await expect(repository.createConditions({ symbol: "NVDA", thesisVersionId: first.id, conditions: [{ id: "condition-1", kind: "metric", name: "price", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 200, period: "CURRENT" }] }))
    .rejects.toMatchObject({ code: "THESIS_VERSION_NOT_CURRENT", statusCode: 409 });
});
