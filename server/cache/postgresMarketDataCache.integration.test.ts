// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresMarketDataCache } from "./postgresMarketDataCache";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const cache = new PostgresMarketDataCache(database);
const baseRecord = {
  key: "quotes:NVDA",
  source: "alpaca" as const,
  data: [{ symbol: "NVDA", price: 100 }],
  asOf: "2026-08-07T09:00:00.000Z",
  fetchedAt: "2026-08-07T09:00:10.000Z",
  expiresAt: "2026-08-07T09:01:10.000Z",
  notices: [] as string[],
};

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("market.refresh_attempt").execute();
  await database.deleteFrom("market.provider_state").execute();
  await database.deleteFrom("market.cache_entry").execute();
});
afterAll(() => database.destroy());

test("stores and returns a schema-valid successful value", async () => {
  await cache.put(baseRecord);
  expect(await cache.get(baseRecord.key)).toEqual(baseRecord);
});

test("prevents an older concurrent response from replacing a newer value", async () => {
  const older = { ...baseRecord, data: [{ symbol: "NVDA", price: 90 }], fetchedAt: "2026-08-07T09:00:09.000Z" };
  const newer = { ...baseRecord, data: [{ symbol: "NVDA", price: 110 }], fetchedAt: "2026-08-07T09:00:11.000Z" };
  await Promise.all([cache.put(newer), cache.put(older)]);
  expect((await cache.get<typeof newer.data>(baseRecord.key))?.fetchedAt).toBe(newer.fetchedAt);
  expect((await cache.get<typeof newer.data>(baseRecord.key))?.data).toEqual(newer.data);
});

test("rejects non-JSON data without replacing the last success", async () => {
  await cache.put(baseRecord);
  await expect(cache.put({ ...baseRecord, data: 1n, fetchedAt: "2026-08-07T09:01:10.000Z" })).rejects.toThrow("JSON");
  expect((await cache.get<typeof baseRecord.data>(baseRecord.key))?.data).toEqual(baseRecord.data);
});

test("shares provider cooldown state and reports cache health", async () => {
  const peer = new PostgresMarketDataCache(database);
  await cache.put(baseRecord);
  await cache.markCooldown("alpaca", "2026-08-07T10:05:00.000Z", "RATE_LIMITED");

  expect(await peer.getCooldown("alpaca")).toBe("2026-08-07T10:05:00.000Z");
  expect(await peer.health()).toEqual({ writable: true, entries: 1, oldestFetchedAt: baseRecord.fetchedAt });
});

test("records refresh outcomes and updates provider success metadata", async () => {
  await cache.recordRefreshAttempt({ key: baseRecord.key, source: "alpaca", status: "success", attemptedAt: "2026-08-07T10:00:00.000Z" });
  await cache.recordRefreshAttempt({ key: baseRecord.key, source: "alpaca", status: "error", errorCode: "TIMEOUT", attemptedAt: "2026-08-07T10:01:00.000Z" });

  const attempts = await database.selectFrom("market.refresh_attempt").select(["status", "errorCode"]).orderBy("attemptedAt").execute();
  const provider = await database.selectFrom("market.provider_state").select(["lastSuccessAt", "lastErrorCode"]).where("source", "=", "alpaca").executeTakeFirstOrThrow();
  expect(attempts).toEqual([{ status: "success", errorCode: null }, { status: "error", errorCode: "TIMEOUT" }]);
  expect(provider.lastSuccessAt?.toISOString()).toBe("2026-08-07T10:00:00.000Z");
  expect(provider.lastErrorCode).toBe("TIMEOUT");
});
