import type { CompanyProfile, DiscoveryUniverseSnapshot, FinancialFact, MarketQuote, UniverseStockSnapshot } from "../../src/features/market/apiDomain";
import { DEFAULT_UNIVERSE_VERSION, defaultUniverse } from "./defaultUniverse";
import { calculateScreenerMetrics } from "./metricCalculator";

export interface UniverseDataProvider {
  getQuotes(symbols: string[]): Promise<{ data: MarketQuote[] }>;
  getCompanyProfile(symbol: string): Promise<{ data: CompanyProfile }>;
  getFinancialFacts?(symbol: string): Promise<{ data: FinancialFact[] }>;
}

async function boundedMap<T, R>(items: T[], max: number, load: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []; let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(max, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await load(items[index]); }
  }));
  return results;
}

export class UniverseService {
  constructor(private readonly provider: UniverseDataProvider, private readonly now = () => new Date().toISOString()) {}
  async getSnapshot(symbols?: string[]): Promise<DiscoveryUniverseSnapshot> {
    const requested = symbols ?? defaultUniverse.map((item) => item.symbol);
    const selected = defaultUniverse.filter((item) => requested.includes(item.symbol));
    const quoteResult = await this.provider.getQuotes(selected.map((item) => item.symbol));
    const quotes = new Map(quoteResult.data.map((item) => [item.symbol, item]));
    const items = await boundedMap(selected, 4, async (item): Promise<UniverseStockSnapshot> => {
      const quote = quotes.get(item.symbol);
      try {
        const [profile, financials] = await Promise.all([this.provider.getCompanyProfile(item.symbol), this.provider.getFinancialFacts?.(item.symbol)]);
        const metrics = calculateScreenerMetrics({ quote, financials: financials?.data, marketCapUsdMillions: profile.data.marketCapitalization });
        const availableMetrics = Object.values(metrics).filter((value) => value !== undefined).length;
        return { symbol: item.symbol, kind: item.kind, name: profile.data.name, sector: profile.data.sector ?? profile.data.industry, marketCapitalization: profile.data.marketCapitalization, metrics, coverage: { status: availableMetrics ? (financials ? "ready" : "partial") : "preparing", availableMetrics, totalMetrics: 14 } };
      } catch {
        const metrics = calculateScreenerMetrics({ quote });
        const availableMetrics = Object.values(metrics).filter((value) => value !== undefined).length;
        return { symbol: item.symbol, kind: item.kind, metrics, coverage: { status: "preparing", availableMetrics, totalMetrics: 14 } };
      }
    });
    return { version: DEFAULT_UNIVERSE_VERSION, items, generatedAt: this.now() };
  }
}
