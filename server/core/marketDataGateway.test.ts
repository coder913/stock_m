// @vitest-environment node
import { expect, test, vi } from "vitest";
import { ProviderRateLimitError, ProviderTimeoutError } from "./errors";
import { MarketDataGateway } from "./marketDataGateway";
import type { CacheRecord, MarketDataCache, RefreshAttempt } from "./providerTypes";

class AsyncMemoryCache implements MarketDataCache {
  records = new Map<string, CacheRecord<unknown>>();
  cooldowns = new Map<string, string>();
  attempts: RefreshAttempt[] = [];
  async get<T>(key: string) { return this.records.get(key) as CacheRecord<T> | undefined; }
  async put<T>(record: CacheRecord<T>) { this.records.set(record.key, record as CacheRecord<unknown>); }
  async markCooldown(source: RefreshAttempt["source"], until: string) { this.cooldowns.set(source, until); }
  async getCooldown(source: RefreshAttempt["source"]) { return this.cooldowns.get(source); }
  async recordRefreshAttempt(attempt: RefreshAttempt) { this.attempts.push(attempt); }
  async health() { return { writable: true, entries: this.records.size }; }
}

const createGateway = () => {
  const cache = new AsyncMemoryCache();
  return { cache, gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T10:00:00Z" }) };
};

test("returns a stale last-success value after a provider rate limit", async () => {
  const { cache, gateway } = createGateway();
  await cache.put({ key: "quotes:NVDA", source: "alpaca", data: [{ symbol: "NVDA", price: 100 }], asOf: "2026-08-07T09:00:00Z", fetchedAt: "2026-08-07T09:00:00Z", expiresAt: "2026-08-07T09:01:00Z", notices: [] });
  const load = vi.fn().mockRejectedValue(new ProviderRateLimitError("alpaca", "2026-08-07T10:05:00Z"));

  const result = await gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, load });

  expect(result).toMatchObject({ stale: true, data: [{ symbol: "NVDA", price: 100 }] });
  expect(result.notices).toContain("数据源限额，正在显示最后成功数据");
  expect(await cache.getCooldown("alpaca")).toBe("2026-08-07T10:05:00Z");
  expect(cache.attempts).toContainEqual(expect.objectContaining({ source: "alpaca", status: "error", errorCode: "RATE_LIMITED" }));
});

test("throws a retryable unavailable error when no cached value exists", async () => {
  const { gateway } = createGateway();
  await expect(gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, load: async () => { throw new ProviderTimeoutError("alpaca"); } }))
    .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
});

test("keeps a fresh value visible when a forced refresh fails", async () => {
  const { cache, gateway } = createGateway();
  await cache.put({ key: "quotes:NVDA", source: "alpaca", data: [{ symbol: "NVDA", price: 100 }], asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", notices: [] });
  const load = vi.fn().mockRejectedValue(new ProviderTimeoutError("alpaca"));

  const result = await gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, forceRefresh: true, load });

  expect(load).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ stale: false, data: [{ symbol: "NVDA", price: 100 }] });
  expect(result.notices).toContain("刷新失败，继续显示最后成功数据");
});

test("records a successful provider refresh", async () => {
  const { cache, gateway } = createGateway();
  await gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, load: async () => ({ data: [{ symbol: "NVDA", price: 120 }], source: "alpaca", asOf: "2026-08-07T10:00:00Z" }) });
  expect(cache.attempts).toEqual([{ key: "quotes:NVDA", source: "alpaca", status: "success", attemptedAt: "2026-08-07T10:00:00Z" }]);
});
