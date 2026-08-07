import type { FastifyInstance } from "fastify";
import type { MarketEvent } from "../../src/features/market/apiDomain";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";
export interface EventsProvider { getEarnings(from: string, to: string, symbols?: string[]): Promise<ProviderResult<MarketEvent[]>>; getCorporateActions?(symbols: string[], from: string, to: string): Promise<ProviderResult<MarketEvent[]>>; getReleaseEvents?(from: string, to: string): Promise<ProviderResult<MarketEvent[]>>; }
export function registerEventRoutes(app: FastifyInstance, dependencies: { gateway: MarketDataGateway; provider: EventsProvider; refreshRegistry: RefreshRegistry }): void {
  const events = (from: string, to: string, symbols?: string[], forceRefresh = false) => dependencies.gateway.readThrough({ key: `events:${from}:${to}:${symbols?.sort().join(",") ?? ""}`, source: "finnhub", ttlMs: 21_600_000, forceRefresh, load: async () => { const groups = await Promise.allSettled([dependencies.provider.getEarnings(from, to, symbols), dependencies.provider.getCorporateActions?.(symbols ?? [], from, to), dependencies.provider.getReleaseEvents?.(from, to)]); const data = groups.flatMap((group) => group.status === "fulfilled" && group.value ? group.value.data : []); const notices = groups.filter((group) => group.status === "rejected").length ? ["部分事件数据暂不可用"] : []; return { source: "finnhub", asOf: new Date().toISOString(), notices, data: [...new Map(data.map((item) => [item.id, item])).values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || (a.timing === "all-day" ? 1 : -1)) }; } });
  app.get("/api/events", (request) => { const query = request.query as { from: string; to: string; symbols?: string }; return events(query.from, query.to, query.symbols?.split(",")); });
  dependencies.refreshRegistry.register("events", (payload) => events(String(payload.from), String(payload.to), (payload.symbols as string[] | undefined), true));
}
