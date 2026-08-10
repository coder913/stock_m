import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
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
import { registerMacroRoutes, type MacroProvider } from "./routes/macroRoutes";

export interface AppDependencies {
  config: Pick<ServerConfig, "host" | "port" | "providers" | "publicStatus">;
  cache: HealthCache;
  refreshRegistry?: RefreshRegistry;
  market?: { gateway: MarketDataGateway; provider: MarketProvider };
  company?: { gateway: MarketDataGateway; sec: SecCompanyProvider; profile?: CompanyProfileProvider; news?: import("./routes/companyRoutes").NewsProvider };
  discovery?: { universe: UniverseService };
  events?: { gateway: MarketDataGateway; provider: EventsProvider };
  macro?: { gateway: MarketDataGateway; provider: MacroProvider };
  staticDir?: string;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const refreshRegistry = dependencies.refreshRegistry ?? new RefreshRegistry();
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?", 1)[0];
    const publicMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
      && path.startsWith("/api/v1/");
    if (!publicMutation) return;
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required", 400, false);
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.message, retryable: error.retryable, requestId: request.id });
    }
    return reply.status(500).send({ code: "INTERNAL_ERROR", message: "服务暂时不可用", retryable: true, requestId: request.id });
  });
  app.get("/api/health", () => ({
    providers: dependencies.config.providers,
    cache: dependencies.cache.health(),
  }));
  if (dependencies.market) registerMarketRoutes(app, { ...dependencies.market, refreshRegistry });
  if (dependencies.company) registerCompanyRoutes(app, { ...dependencies.company, refreshRegistry });
  if (dependencies.discovery) registerDiscoveryRoutes(app, dependencies.discovery);
  if (dependencies.events) registerEventRoutes(app, { ...dependencies.events, refreshRegistry });
  if (dependencies.macro) registerMacroRoutes(app, { ...dependencies.macro, refreshRegistry });
  registerCacheRoutes(app, refreshRegistry);
  if (dependencies.staticDir) { void app.register(fastifyStatic, { root: resolve(dependencies.staticDir), wildcard: false }); app.get("/*", (_request, reply) => reply.sendFile("index.html")); }
  return app;
}
