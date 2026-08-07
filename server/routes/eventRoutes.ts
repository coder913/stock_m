import type { FastifyInstance } from "fastify";
import type { MarketEvent } from "../../src/features/market/apiDomain";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";
export interface EventsProvider { getEarnings(from: string, to: string, symbols?: string[]): Promise<ProviderResult<MarketEvent[]>>; }
export function registerEventRoutes(app: FastifyInstance, dependencies: { gateway: MarketDataGateway; provider: EventsProvider; refreshRegistry: RefreshRegistry }): void {
  const events = (from: string, to: string, symbols?: string[], forceRefresh = false) => dependencies.gateway.readThrough({ key: `events:${from}:${to}:${symbols?.sort().join(",") ?? ""}`, source: "finnhub", ttlMs: 21_600_000, forceRefresh, load: () => dependencies.provider.getEarnings(from, to, symbols) });
  app.get("/api/events", (request) => { const query = request.query as { from: string; to: string; symbols?: string }; return events(query.from, query.to, query.symbols?.split(",")); });
  dependencies.refreshRegistry.register("events", (payload) => events(String(payload.from), String(payload.to), (payload.symbols as string[] | undefined), true));
}
