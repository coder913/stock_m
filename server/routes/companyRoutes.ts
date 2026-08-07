import type { FastifyInstance } from "fastify";
import type { FinancialFact, SecFiling } from "../../src/features/market/apiDomain";
import { ApiError } from "../core/errors";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";

export interface SecCompanyProvider { getFinancialFacts(symbol: string): Promise<ProviderResult<FinancialFact[]>>; getFilings(symbol: string): Promise<ProviderResult<SecFiling[]>>; }
const symbolFrom = (value: string) => { const symbol = value.toUpperCase(); if (!/^[A-Z0-9.-]+$/.test(symbol)) throw new ApiError("INVALID_SYMBOL", "股票代码格式无效", 400, false); return symbol; };

export function registerCompanyRoutes(app: FastifyInstance, dependencies: { gateway: MarketDataGateway; sec: SecCompanyProvider; refreshRegistry: RefreshRegistry }): void {
  const financials = (symbol: string, forceRefresh = false) => dependencies.gateway.readThrough({ key: `financials:${symbol}`, source: "sec", ttlMs: 86_400_000, forceRefresh, load: () => dependencies.sec.getFinancialFacts(symbol) });
  const filings = (symbol: string, forceRefresh = false) => dependencies.gateway.readThrough({ key: `filings:${symbol}`, source: "sec", ttlMs: 86_400_000, forceRefresh, load: () => dependencies.sec.getFilings(symbol) });
  app.get("/api/companies/:symbol/financials", (request) => financials(symbolFrom((request.params as { symbol: string }).symbol)));
  app.get("/api/companies/:symbol/filings", (request) => filings(symbolFrom((request.params as { symbol: string }).symbol)));
  dependencies.refreshRegistry.register("financials", (payload) => financials(symbolFrom(String(payload.symbol)), true));
  dependencies.refreshRegistry.register("filings", (payload) => filings(symbolFrom(String(payload.symbol)), true));
}
