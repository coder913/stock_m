import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RefreshRegistry } from "../core/refreshRegistry";

const refreshSchema = z.object({ resource: z.string().min(1) }).passthrough();

export function registerCacheRoutes(app: FastifyInstance, registry: RefreshRegistry): void {
  app.post("/api/cache/refresh", async (request) => registry.refresh(refreshSchema.parse(request.body)));
}
