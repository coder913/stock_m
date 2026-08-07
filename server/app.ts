import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config";
import { ApiError } from "./core/errors";
import type { HealthCache } from "./core/providerTypes";
import { RefreshRegistry } from "./core/refreshRegistry";
import { registerCacheRoutes } from "./routes/cacheRoutes";
import { registerMarketRoutes, type MarketProvider } from "./routes/marketRoutes";
import type { MarketDataGateway } from "./core/marketDataGateway";
import { registerCompanyRoutes, type SecCompanyProvider } from "./routes/companyRoutes";
import type { CompanyProfileProvider } from "./routes/companyRoutes";
import { registerDiscoveryRoutes } from "./routes/discoveryRoutes";
import { registerEventRoutes, type EventsProvider } from "./routes/eventRoutes";
import type { UniverseService } from "./universe/universeService";

export interface AppDependencies {
  config: Pick<ServerConfig, "host" | "port" | "providers" | "publicStatus">;
  cache: HealthCache;
  refreshRegistry?: RefreshRegistry;
  market?: { gateway: MarketDataGateway; provider: MarketProvider };
  company?: { gateway: MarketDataGateway; sec: SecCompanyProvider; profile?: CompanyProfileProvider; news?: import("./routes/companyRoutes").NewsProvider };
  discovery?: { universe: UniverseService };
  events?: { gateway: MarketDataGateway; provider: EventsProvider };
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const refreshRegistry = dependencies.refreshRegistry ?? new RefreshRegistry();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.message, retryable: error.retryable });
    }
    return reply.status(500).send({ code: "INTERNAL_ERROR", message: "服务暂时不可用", retryable: true });
  });
  app.get("/api/health", () => ({
    providers: dependencies.config.providers,
    cache: dependencies.cache.health(),
  }));
  if (dependencies.market) registerMarketRoutes(app, { ...dependencies.market, refreshRegistry });
  if (dependencies.company) registerCompanyRoutes(app, { ...dependencies.company, refreshRegistry });
  if (dependencies.discovery) registerDiscoveryRoutes(app, dependencies.discovery);
  if (dependencies.events) registerEventRoutes(app, { ...dependencies.events, refreshRegistry });
  registerCacheRoutes(app, refreshRegistry);
  return app;
}
