// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { buildApp } from "../app";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { RefreshRegistry } from "../core/refreshRegistry";

let cache: SqliteMarketDataCache | undefined;
afterEach(() => cache?.close());

const createApp = () => {
  cache = new SqliteMarketDataCache(":memory:");
  return buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } },
    cache,
    refreshRegistry: new RefreshRegistry(),
    market: {
      gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T14:00:00Z" }),
      provider: {
        getQuotes: async (symbols) => ({ source: "alpaca" as const, asOf: "2026-08-07T14:00:00Z", delayMinutes: 15, data: symbols.map((symbol) => ({ symbol, price: 100, previousClose: 99, currency: "USD" as const, marketSession: "regular" as const })) }),
        getBars: async () => ({ source: "alpaca" as const, asOf: "2026-08-07T14:00:00Z", data: [] }),
        getMarketStatus: async () => ({ source: "alpaca" as const, asOf: "2026-08-07T14:00:00Z", data: { isOpen: true, session: "regular" as const } }),
      },
    },
  });
};

test("rejects more than 100 symbols without truncating", async () => {
  const app = createApp();
  const symbols = Array.from({ length: 101 }, (_, index) => `S${index}`).join(",");
  const response = await app.inject({ url: `/api/market/quotes?symbols=${symbols}` });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ code: "TOO_MANY_SYMBOLS" });
  await app.close();
});

test("uppercases and deduplicates quote symbols in the response", async () => {
  const app = createApp();
  const response = await app.inject({ url: "/api/market/quotes?symbols=nvda,NVDA,aapl" });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.map((quote: { symbol: string }) => quote.symbol)).toEqual(["NVDA", "AAPL"]);
  await app.close();
});

test("manually refreshes quotes through the registered refresh resource", async () => {
  const app = createApp();
  const response = await app.inject({ method: "POST", url: "/api/cache/refresh", payload: { resource: "quotes", symbols: ["nvda"] } });
  expect(response.statusCode).toBe(200);
  expect(response.json().data[0].symbol).toBe("NVDA");
  await app.close();
});
