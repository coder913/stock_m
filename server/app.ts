import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config";
import { ApiError } from "./core/errors";
import type { HealthCache } from "./core/providerTypes";
import { RefreshRegistry } from "./core/refreshRegistry";
import { registerCacheRoutes } from "./routes/cacheRoutes";

export interface AppDependencies {
  config: Pick<ServerConfig, "host" | "port" | "providers" | "publicStatus">;
  cache: HealthCache;
  refreshRegistry?: RefreshRegistry;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
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
  registerCacheRoutes(app, dependencies.refreshRegistry ?? new RefreshRegistry());
  return app;
}
