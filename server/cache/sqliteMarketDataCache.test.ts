// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { SqliteMarketDataCache } from "./sqliteMarketDataCache";

const caches: SqliteMarketDataCache[] = [];
const createCache = () => {
  const cache = new SqliteMarketDataCache(":memory:");
  caches.push(cache);
  return cache;
};

afterEach(() => { caches.splice(0).forEach((cache) => cache.close()); });

test("keeps the last successful cache record when a new payload cannot be serialized", () => {
  const cache = createCache();
  cache.put({
    key: "quotes:NVDA",
    source: "alpaca",
    data: [{ symbol: "NVDA", price: 100 }],
    asOf: "2026-08-07T09:00:00Z",
    fetchedAt: "2026-08-07T09:00:10Z",
    expiresAt: "2026-08-07T09:01:10Z",
    notices: [],
  });

  expect(() => cache.put({
    key: "quotes:NVDA",
    source: "alpaca",
    data: 1n,
    asOf: "2026-08-07T09:01:00Z",
    fetchedAt: "2026-08-07T09:01:10Z",
    expiresAt: "2026-08-07T09:02:10Z",
    notices: [],
  })).toThrow();

  expect(cache.get<{ symbol: string; price: number }[]>("quotes:NVDA")?.data)
    .toEqual([{ symbol: "NVDA", price: 100 }]);
});

test("persists a provider cooldown without storing any credentials", () => {
  const cache = createCache();
  cache.markCooldown("alpaca", "2026-08-07T10:05:00Z");

  expect(cache.getCooldown("alpaca")).toBe("2026-08-07T10:05:00Z");
  expect(JSON.stringify(cache.health())).not.toContain("secret");
});
