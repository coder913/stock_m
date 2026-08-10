// @vitest-environment node
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { resetTestDatabase } from "./resetTestDatabase";

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test",
);

beforeAll(async () => {
  await migrateToLatest(database);
});

afterAll(async () => {
  await database.destroy();
});

test("clears owned state while preserving migrations and recreating singleton rows", async () => {
  const now = new Date("2026-08-10T00:00:00Z");
  await resetTestDatabase(database);
  await database.deleteFrom("platform.worker_heartbeat").execute();
  await database.deleteFrom("monitor.run").execute();
  await database.deleteFrom("monitor.schedule_state").execute();
  const migrationsBefore = await database.selectFrom("platform.schema_migration").select("name").orderBy("name").execute();
  await database.insertInto("core.watchlist_group").values({
    id: "reset-me",
    name: "Reset me",
    orderIndex: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }).execute();
  await database.insertInto("market.cache_entry").values({
    cacheKey: "quote:NVDA",
    source: "alpaca",
    payloadJson: { symbol: "NVDA" },
    asOf: now,
    fetchedAt: now,
    expiresAt: now,
    delayMinutes: null,
    noticesJson: [],
  }).execute();
  await database.insertInto("platform.worker_heartbeat").values({ worker: "monitor", state: "ready", queueLag: 2, heartbeatAt: now }).execute();
  await database.insertInto("monitor.schedule_state").values({ runType: "price", lastSuccessNaturalPeriod: "2026-08-10T10:00-04:00", lastSuccessAt: now, updatedAt: now }).execute();

  await resetTestDatabase(database);

  expect(await database.selectFrom("core.watchlist_group").selectAll().execute()).toEqual([]);
  expect(await database.selectFrom("market.cache_entry").selectAll().execute()).toEqual([]);
  expect(await database.selectFrom("platform.worker_heartbeat").selectAll().execute()).toEqual([]);
  expect(await database.selectFrom("monitor.schedule_state").selectAll().execute()).toEqual([]);
  expect(await database.selectFrom("platform.schema_migration").select("name").orderBy("name").execute()).toEqual(migrationsBefore);
  expect(await database.selectFrom("platform.installation").select("id").execute()).toEqual([{ id: "local-single-user" }]);
  expect(await database.selectFrom("core.user_universe_revision").selectAll().execute()).toEqual([
    { id: "local-single-user", version: 0 },
  ]);
  expect(await database.selectFrom("core.manual_portfolio").selectAll().execute()).toEqual([
    { id: "default", revision: 0 },
  ]);
  expect(await database.selectFrom("core.manual_portfolio_settings").select(["portfolioId", "initialCash", "benchmarkSymbol", "baseCurrency", "version"]).execute()).toEqual([
    { portfolioId: "default", initialCash: "10000.00000000", benchmarkSymbol: "SPY", baseCurrency: "USD", version: 1 },
  ]);
});
