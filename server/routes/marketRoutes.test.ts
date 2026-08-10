// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import type { PriceBar } from "../../src/features/market/apiDomain";
import { buildApp } from "../app";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { RefreshRegistry } from "../core/refreshRegistry";
import type { MarketProvider } from "./marketRoutes";

let cache: SqliteMarketDataCache | undefined;
afterEach(() => cache?.close());

const fixtureBar = (symbol: string): PriceBar => ({
  symbol,
  startedAt: "2026-08-06T04:00:00Z",
  open: 160,
  high: 168,
  low: 159,
  close: 167,
  volume: 50_000_000,
  adjusted: false,
});

const createApp = (marketOverrides: Partial<MarketProvider> = {}) => {
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
        getBatchBars: async (symbols) => ({ source: "alpaca" as const, asOf: "2026-08-07T14:00:00Z", data: { symbols: Object.fromEntries(symbols.map((symbol) => [symbol, [fixtureBar(symbol)]])), missingSymbols: [] } }),
        getMarketStatus: async () => ({ source: "alpaca" as const, asOf: "2026-08-07T14:00:00Z", data: { isOpen: true, session: "regular" as const } }),
        ...marketOverrides,
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

test("serves cached batch daily bars", async () => {
  const getBatchBars = vi.fn().mockResolvedValue({
    source: "alpaca" as const,
    asOf: "2026-08-06T04:00:00Z",
    data: {
      symbols: { NVDA: [fixtureBar("NVDA")] },
      missingSymbols: ["MSFT"],
    },
  });
  const app = createApp({ getBatchBars });

  const response = await app.inject({
    method: "GET",
    url: "/api/market/bars?symbols=NVDA,MSFT&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=raw",
  });

  expect(response.statusCode).toBe(200);
  expect(getBatchBars).toHaveBeenCalledWith(
    ["NVDA", "MSFT"],
    expect.objectContaining({ adjustment: "raw", timeframe: "1Day" }),
  );
  expect(response.json().data.missingSymbols).toEqual(["MSFT"]);
  await app.close();
});

test.each([
  ["no symbols", "/api/market/bars?timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=raw"],
  ["invalid symbol", "/api/market/bars?symbols=NVDA,$BAD&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=raw"],
  ["minute timeframe", "/api/market/bars?symbols=NVDA&timeframe=1Min&start=2026-08-01&end=2026-08-10&adjustment=raw"],
  ["reversed dates", "/api/market/bars?symbols=NVDA&timeframe=1Day&start=2026-08-10&end=2026-08-01&adjustment=raw"],
  ["invalid adjustment", "/api/market/bars?symbols=NVDA&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=nope"],
])("rejects invalid batch-bars query: %s", async (_name, url) => {
  const app = createApp();
  const response = await app.inject({ method: "GET", url });
  expect(response.statusCode).toBe(400);
  await app.close();
});

test("rejects 101 batch-bar symbols", async () => {
  const app = createApp();
  const symbols = Array.from({ length: 101 }, (_, index) => `S${index}`).join(",");
  const response = await app.inject({
    method: "GET",
    url: `/api/market/bars?symbols=${symbols}&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=raw`,
  });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ code: "TOO_MANY_SYMBOLS" });
  await app.close();
});
