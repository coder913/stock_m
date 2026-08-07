import type { FastifyInstance } from "fastify";
import type { MarketTheme } from "../../src/features/market/apiDomain";
import type { UniverseService } from "../universe/universeService";

const sectorEtfs: Record<string, string> = { Semiconductors: "SOXX", Technology: "XLK", Financials: "XLF", Healthcare: "XLV", "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", Energy: "XLE", Industrials: "XLI", Utilities: "XLU", Materials: "XLB", "Real Estate": "XLRE" };
export function registerDiscoveryRoutes(app: FastifyInstance, dependencies: { universe: UniverseService }): void {
  app.get("/api/discovery/universe", async (request) => {
    const symbols = (request.query as { symbols?: string }).symbols?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    return dependencies.universe.getSnapshot(symbols?.length ? symbols : undefined);
  });
  app.get("/api/discovery/themes", async () => {
    const snapshot = await dependencies.universe.getSnapshot();
    const groups = new Map<string, typeof snapshot.items>();
    for (const item of snapshot.items.filter((entry) => entry.kind === "stock" && entry.sector)) groups.set(item.sector!, [...(groups.get(item.sector!) ?? []), item]);
    return [...groups.entries()].map(([name, items]): MarketTheme => {
      const weighted = items.reduce((sum, item) => sum + (item.marketCapitalization ?? 0), 0);
      const changePercent = weighted ? items.reduce((sum, item) => sum + (item.metrics.dailyChangePercent ?? 0) * (item.marketCapitalization ?? 0), 0) / weighted : undefined;
      const availableMetrics = items.filter((item) => item.metrics.dailyChangePercent !== undefined).length;
      return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, symbols: items.map((item) => item.symbol), etfSymbol: sectorEtfs[name], changePercent, coverage: { status: availableMetrics === items.length ? "ready" : "partial", availableMetrics, totalMetrics: items.length } };
    });
  });
}
