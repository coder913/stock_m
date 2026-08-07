import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config";
import { ApiError } from "./core/errors";
import type { HealthCache } from "./core/providerTypes";
import { RefreshRegistry } from "./core/refreshRegistry";
import { registerCacheRoutes } from "./routes/cacheRoutes";
import { registerMarketRoutes, type MarketProvider } from "./routes/marketRoutes";
import type { MarketDataGateway } from "./core/marketDataGateway";
import { registerCompanyRoutes, type SecCompanyProvider } from "./routes/companyRoutes";

export interface AppDependencies {
  config: Pick<ServerConfig, "host" | "port" | "providers" | "publicStatus">;
  cache: HealthCache;
  refreshRegistry?: RefreshRegistry;
  market?: { gateway: MarketDataGateway; provider: MarketProvider };
  company?: { gateway: MarketDataGateway; sec: SecCompanyProvider };
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
  registerCacheRoutes(app, refreshRegistry);
  return app;
}
