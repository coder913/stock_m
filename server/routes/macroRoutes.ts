import type { FastifyInstance } from "fastify";
import type { MacroObservation } from "../../src/features/market/apiDomain";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";
export interface MacroProvider { getSeries(ids: string[]): Promise<ProviderResult<MacroObservation[]>>; }
export function registerMacroRoutes(app: FastifyInstance, dependencies: { gateway: MarketDataGateway; provider: MacroProvider; refreshRegistry: RefreshRegistry }) { const macro = (ids: string[], forceRefresh = false) => dependencies.gateway.readThrough({ key: `macro:${ids.slice().sort().join(",")}`, source: "fred", ttlMs: 86_400_000, forceRefresh, load: () => dependencies.provider.getSeries(ids) }); app.get("/api/macro/series", (request) => macro(String((request.query as { ids?: string }).ids ?? "").split(",").filter(Boolean))); dependencies.refreshRegistry.register("macro", (payload) => macro(payload.ids as string[], true)); }
