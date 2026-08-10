// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "../app";
import { MarketDataGateway } from "../core/marketDataGateway";
import { InMemoryMarketDataCache } from "../testing/inMemoryMarketDataCache";

const config = {
  host: "127.0.0.1",
  port: 8787,
  providers: {
    alpaca: { configured: true },
    sec: { configured: true },
    finnhub: { configured: true },
    fred: { configured: true },
  },
  publicStatus: { providers: {} },
};

test("serves cached earnings through events route", async () => {
  const cache = new InMemoryMarketDataCache();
  const app = buildApp({
    config,
    cache,
    events: {
      gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T00:00:00Z" }),
      provider: {
        getEarnings: async () => ({
          source: "finnhub" as const,
          asOf: "2026-08-01",
          data: [{ id: "earnings", type: "earnings" as const, symbol: "NVDA", title: "NVDA 财报", scheduledAt: "2026-08-27", timing: "after-market" as const, source: "finnhub" as const }],
        }),
      },
    },
  });
  const response = await app.inject("/api/events?from=2026-08-01&to=2026-08-31");
  expect(response.json().data[0]).toMatchObject({ type: "earnings", timing: "after-market" });
  await app.close();
});

test("caches FRED release events separately for 24 hours", async () => {
  const cache = new InMemoryMarketDataCache();
  const app = buildApp({
    config,
    cache,
    events: {
      gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T00:00:00Z" }),
      provider: {
        getEarnings: async () => ({ source: "finnhub" as const, asOf: "2026-08-07", data: [] }),
        getReleaseEvents: async () => ({ source: "fred" as const, asOf: "2026-08-07", data: [{ id: "cpi", type: "macro" as const, title: "Consumer Price Index", scheduledAt: "2026-08-12", timing: "all-day" as const, source: "fred" as const }] }),
      },
    },
  });

  await app.inject("/api/events?from=2026-08-01&to=2026-08-31");

  expect((await cache.get("events:macro:2026-08-01:2026-08-31"))?.expiresAt).toBe("2026-08-08T00:00:00.000Z");
  await app.close();
});

test("sorts timed events before date-only macro releases on the same date", async () => {
  const cache = new InMemoryMarketDataCache();
  const app = buildApp({
    config,
    cache,
    events: {
      gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T00:00:00Z" }),
      provider: {
        getEarnings: async () => ({ source: "finnhub" as const, asOf: "2026-08-07", data: [{ id: "earnings", type: "earnings" as const, symbol: "NVDA", title: "NVDA 财报", scheduledAt: "2026-08-12T20:00:00Z", timing: "after-market" as const, source: "finnhub" as const }] }),
        getReleaseEvents: async () => ({ source: "fred" as const, asOf: "2026-08-07", data: [{ id: "cpi", type: "macro" as const, title: "Consumer Price Index", scheduledAt: "2026-08-12", timing: "all-day" as const, source: "fred" as const }] }),
      },
    },
  });

  const response = await app.inject("/api/events?from=2026-08-01&to=2026-08-31");

  expect(response.json().data.map((event: { id: string }) => event.id)).toEqual(["earnings", "cpi"]);
  await app.close();
});
