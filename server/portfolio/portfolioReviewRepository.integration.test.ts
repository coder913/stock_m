// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresPortfolioReviewRepository } from "./portfolioReviewRepository";
const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresPortfolioReviewRepository(database, () => new Date("2026-08-10T10:00:00Z"));
beforeAll(() => migrateToLatest(database));
beforeEach(async () => { await database.deleteFrom("core.portfolio_weekly_review").execute(); await database.deleteFrom("core.portfolio_snapshot").execute(); });
afterAll(() => database.destroy());
test("creates immutable weekly review versions", async () => {
  const input = { week: "2026-W32", snapshot: { asOf: "2026-08-10T09:00:00Z", positions: [], cash: 10_000, totalValue: 10_000, sectorExposure: {} }, events: [], alerts: [], judgment: "plan", action: "hold", result: "stable", nextObservations: ["earnings"] };
  expect((await repository.submit(input)).version).toBe(1);
  expect((await repository.submit({ ...input, action: "trim" })).version).toBe(2);
  expect((await repository.list("2026-W32")).map((item) => item.action)).toEqual(["hold", "trim"]);
});
