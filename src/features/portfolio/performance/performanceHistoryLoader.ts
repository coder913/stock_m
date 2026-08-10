import type { BatchPriceBars, DataEnvelope, MarketEvent } from "../../market/apiDomain";
import type { LedgerEvent, PortfolioSettings } from "../domain";
import { sortLedgerEvents } from "../portfolioLedger";
import { toNewYorkMarketDate } from "../portfolioSettingsRepository";
import type { PerformanceHistoryLoad, PerformanceResourceState } from "./domain";

interface PerformanceMarketClient {
  getBatchBars(symbols: string[], query: { start: string; end: string; adjustment: "raw" | "all" }): Promise<DataEnvelope<BatchPriceBars>>;
  getEvents(query: { from: string; to: string; symbols?: string[] }): Promise<DataEnvelope<MarketEvent[]>>;
}

interface LoadInput {
  settings: PortfolioSettings;
  events: LedgerEvent[];
  ignoredSplitIds: string[];
  to: string;
}

const stateOf = <T,>(envelope: DataEnvelope<T>): PerformanceResourceState => envelope.stale || envelope.fallback ? "stale" : "fresh";
const eventDate = (event: LedgerEvent): string => event.type === "split" ? event.occurredAt.slice(0, 10) : toNewYorkMarketDate(event.occurredAt);

const heldOn = (events: LedgerEvent[], symbol: string, marketDate: string): boolean => {
  let quantity = 0;
  for (const event of sortLedgerEvents(events).filter((item) => item.symbol === symbol && eventDate(item) <= marketDate)) {
    if (event.type === "buy") quantity += event.quantity ?? 0;
    if (event.type === "sell") quantity -= event.quantity ?? 0;
    if (event.type === "split") quantity *= event.quantityMultiplier ?? 1;
  }
  return quantity > 0;
};

export class PerformanceHistoryLoader {
  constructor(private readonly client: PerformanceMarketClient) {}

  async load(input: LoadInput): Promise<PerformanceHistoryLoad> {
    const symbols = [...new Set(input.events.flatMap((event) => (
      event.symbol && (event.type === "buy" || event.type === "sell" || event.type === "split")
        ? [event.symbol.toUpperCase()]
        : []
    )))].sort();
    const earliestEvent = input.events.map(eventDate).sort()[0];
    const start = earliestEvent && earliestEvent < input.settings.inceptionDate ? earliestEvent : input.settings.inceptionDate;
    const emptyBars = (): DataEnvelope<BatchPriceBars> => ({ data: { symbols: {}, missingSymbols: [] }, source: "alpaca", asOf: start, fetchedAt: start, expiresAt: start, stale: false, notices: [] });
    const emptyEvents = (): DataEnvelope<MarketEvent[]> => ({ data: [], source: "composite", asOf: start, fetchedAt: start, expiresAt: start, stale: false, notices: [] });
    const settled = await Promise.allSettled([
      symbols.length ? this.client.getBatchBars(symbols, { start, end: input.to, adjustment: "raw" }) : Promise.resolve(emptyBars()),
      this.client.getBatchBars([input.settings.benchmarkSymbol], { start, end: input.to, adjustment: "all" }),
      symbols.length ? this.client.getEvents({ from: start, to: input.to, symbols }) : Promise.resolve(emptyEvents()),
    ]);
    const holdings = settled[0];
    const benchmark = settled[1];
    const events = settled[2];
    const resourceStates = {
      holdings: holdings.status === "fulfilled" ? stateOf(holdings.value) : "unavailable",
      benchmark: benchmark.status === "fulfilled" ? stateOf(benchmark.value) : "unavailable",
      events: events.status === "fulfilled" ? stateOf(events.value) : "unavailable",
    } satisfies PerformanceHistoryLoad["resourceStates"];
    const confirmedIds = new Set(input.events.flatMap((event) => event.type === "split" && event.sourceEventId ? [event.sourceEventId] : []));
    const ignoredIds = new Set(input.ignoredSplitIds);
    const marketEvents = events.status === "fulfilled" ? events.value.data : [];
    const pendingSplits = marketEvents.filter((event) => (
      event.type === "split"
      && Boolean(event.symbol)
      && !confirmedIds.has(event.id)
      && !ignoredIds.has(event.id)
      && heldOn(input.events, event.symbol!, event.split?.effectiveDate ?? event.scheduledAt.slice(0, 10))
    ));
    const notices = [
      ...(holdings.status === "fulfilled" ? holdings.value.notices : ["持仓历史行情暂不可用"]),
      ...(benchmark.status === "fulfilled" ? benchmark.value.notices : ["基准历史行情暂不可用"]),
      ...(events.status === "fulfilled" ? events.value.notices : ["无法验证拆股事件"]),
    ];
    const unavailableCritical = resourceStates.holdings === "unavailable" || resourceStates.events === "unavailable";
    const staleAny = Object.values(resourceStates).some((state) => state === "stale");
    return {
      settings: structuredClone(input.settings),
      events: structuredClone(input.events),
      holdingBars: holdings.status === "fulfilled" ? holdings.value.data.symbols : {},
      benchmarkBars: benchmark.status === "fulfilled" ? benchmark.value.data.symbols[input.settings.benchmarkSymbol] ?? [] : [],
      pendingSplits,
      notices: [...new Set(notices)],
      sourceAsOf: {
        holdings: holdings.status === "fulfilled" ? holdings.value.asOf : undefined,
        benchmark: benchmark.status === "fulfilled" ? benchmark.value.asOf : undefined,
        events: events.status === "fulfilled" ? events.value.asOf : undefined,
      },
      resourceStates,
      dataState: unavailableCritical ? "unavailable" : staleAny ? "stale" : "fresh",
    };
  }
}
