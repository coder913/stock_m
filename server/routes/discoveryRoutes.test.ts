// @vitest-environment node
import { expect, test } from "vitest";
import Fastify from "fastify";
import { registerDiscoveryRoutes } from "./discoveryRoutes";
test("serves requested live-universe symbols", async () => { const app = Fastify(); registerDiscoveryRoutes(app, { universe: { getSnapshot: async (symbols?: string[]) => ({ version: "v1", generatedAt: "2026-08-07T14:00:00Z", items: (symbols ?? []).map((symbol) => ({ symbol, kind: "stock" as const, metrics: {}, coverage: { status: "preparing" as const, availableMetrics: 0, totalMetrics: 14 } })) }) } as never }); const response = await app.inject("/api/discovery/universe?symbols=NVDA,AAPL"); expect(response.json().data.items.map((item: { symbol: string }) => item.symbol)).toEqual(["NVDA", "AAPL"]); await app.close(); });
