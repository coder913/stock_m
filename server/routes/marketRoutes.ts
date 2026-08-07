import type { FastifyInstance } from "fastify";
import type { MarketStatus, PriceBar, MarketQuote } from "../../src/features/market/apiDomain";
import { ApiError } from "../core/errors";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";

export interface MarketProvider { getQuotes(symbols: string[], feed?: "delayed_sip" | "iex"): Promise<ProviderResult<MarketQuote[]>>; getBars(symbol: string, query: { timeframe: "1Min" | "1Day"; start: string; end: string; feed?: "delayed_sip" | "iex" }): Promise<ProviderResult<PriceBar[]>>; getMarketStatus(): Promise<ProviderResult<MarketStatus>>; }

const symbolsFrom = (value: string): string[] => {
  const symbols = [...new Set(value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length) throw new ApiError("INVALID_SYMBOLS", "请提供至少一个股票代码", 400, false);
  if (symbols.length > 100) throw new ApiError("TOO_MANY_SYMBOLS", "单次最多查询 100 个股票代码", 400, false);
  if (symbols.some((symbol) => !/^[A-Z0-9.-]+$/.test(symbol))) throw new ApiError("INVALID_SYMBOL", "股票代码格式无效", 400, false);
  return symbols;
};

export function registerMarketRoutes(app: FastifyInstance, dependencies: { gateway: MarketDataGateway; provider: MarketProvider; refreshRegistry: RefreshRegistry }): void {
  const quotes = (symbols: string[], forceRefresh = false) => dependencies.gateway.readThrough({ key: `quotes:delayed_sip:${[...symbols].sort().join(",")}`, source: "alpaca", ttlMs: 60_000, forceRefresh, load: () => dependencies.provider.getQuotes(symbols, "delayed_sip") });
  app.get("/api/market/status", () => dependencies.gateway.readThrough({ key: "market-status", source: "alpaca", ttlMs: 60_000, load: () => dependencies.provider.getMarketStatus() }));
  app.get("/api/market/quotes", async (request) => quotes(symbolsFrom((request.query as { symbols?: string }).symbols ?? "")));
  app.get("/api/market/bars/:symbol", async (request) => {
    const params = request.params as { symbol: string };
    const query = request.query as { timeframe?: "1Min" | "1Day"; start?: string; end?: string };
    const symbol = symbolsFrom(params.symbol)[0];
    if (!query.start || !query.end || (query.timeframe !== "1Min" && query.timeframe !== "1Day")) throw new ApiError("INVALID_BARS_QUERY", "K 线查询参数无效", 400, false);
    return dependencies.gateway.readThrough({ key: `bars:delayed_sip:${symbol}:${query.timeframe}:${query.start}:${query.end}`, source: "alpaca", ttlMs: query.timeframe === "1Min" ? 60_000 : 900_000, load: () => dependencies.provider.getBars(symbol, { timeframe: query.timeframe!, start: query.start!, end: query.end!, feed: "delayed_sip" }) });
  });
  dependencies.refreshRegistry.register("quotes", async (payload) => quotes(symbolsFrom((payload.symbols as string[]).join(",")), true));
}
