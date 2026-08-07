// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { ProviderRateLimitError, ProviderTimeoutError } from "./errors";
import { MarketDataGateway } from "./marketDataGateway";

let cache: SqliteMarketDataCache | undefined;
afterEach(() => cache?.close());

const createGateway = () => {
  cache = new SqliteMarketDataCache(":memory:");
  return new MarketDataGateway({ cache, now: () => "2026-08-07T10:00:00Z" });
};

test("returns a stale last-success value after a provider rate limit", async () => {
  const gateway = createGateway();
  cache!.put({ key: "quotes:NVDA", source: "alpaca", data: [{ symbol: "NVDA", price: 100 }], asOf: "2026-08-07T09:00:00Z", fetchedAt: "2026-08-07T09:00:00Z", expiresAt: "2026-08-07T09:01:00Z", notices: [] });
  const load = vi.fn().mockRejectedValue(new ProviderRateLimitError("alpaca", "2026-08-07T10:05:00Z"));

  const result = await gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, load });

  expect(result).toMatchObject({ stale: true, data: [{ symbol: "NVDA", price: 100 }] });
  expect(result.notices).toContain("数据源限额，正在显示最后成功数据");
  expect(cache!.getCooldown("alpaca")).toBe("2026-08-07T10:05:00Z");
});

test("throws a retryable unavailable error when no cached value exists", async () => {
  const gateway = createGateway();
  await expect(gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, load: async () => { throw new ProviderTimeoutError("alpaca"); } }))
    .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
});

test("keeps a fresh value visible when a forced refresh fails", async () => {
  const gateway = createGateway();
  cache!.put({ key: "quotes:NVDA", source: "alpaca", data: [{ symbol: "NVDA", price: 100 }], asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", notices: [] });
  const load = vi.fn().mockRejectedValue(new ProviderTimeoutError("alpaca"));

  const result = await gateway.readThrough({ key: "quotes:NVDA", source: "alpaca", ttlMs: 60_000, forceRefresh: true, load });

  expect(load).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ stale: false, data: [{ symbol: "NVDA", price: 100 }] });
  expect(result.notices).toContain("刷新失败，继续显示最后成功数据");
});
