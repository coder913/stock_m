// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "../app";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
test("serves cached earnings through events route", async () => { const cache = new SqliteMarketDataCache(":memory:"); const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: true }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache, events: { gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T00:00:00Z" }), provider: { getEarnings: async () => ({ source: "finnhub" as const, asOf: "2026-08-01", data: [{ id: "earnings", type: "earnings" as const, symbol: "NVDA", title: "NVDA 财报", scheduledAt: "2026-08-27", timing: "after-market" as const, source: "finnhub" as const }] }) } } }); const response = await app.inject("/api/events?from=2026-08-01&to=2026-08-31"); expect(response.json().data[0]).toMatchObject({ type: "earnings", timing: "after-market" }); await app.close(); cache.close(); });
