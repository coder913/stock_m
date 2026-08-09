import type { DataEnvelope, DiscoveryUniverseSnapshot, MarketEvent, MarketQuote, StockMetrics } from "../market/apiDomain";
import type { MarketApiClient } from "../market/marketApiClient";
import type { EvaluationDataState, MetricValue, MonitorMetric, MonitorSnapshot, ThesisCondition } from "./domain";

type MonitorMarketClient = Pick<MarketApiClient, "getQuotes" | "getUniverse" | "getEvents">;
const quoteMetrics = new Set<MonitorMetric>(["price", "dailyChangePercent"]);
const universeMetrics: MonitorMetric[] = ["revenueGrowthYoY", "operatingMargin", "freeCashFlow", "freeCashFlowYield", "netDebtToEbitda", "earningsSurprise", "grossMarginYoYChange", "priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d"];

function envelopeState(envelope: DataEnvelope<unknown>): EvaluationDataState { return envelope.stale || envelope.fallback ? "stale" : "fresh"; }
function metricValue(value: number | undefined, envelope: DataEnvelope<unknown>): MetricValue {
  const state = envelopeState(envelope);
  return { value, source: envelope.source, asOf: envelope.asOf, dataState: state === "fresh" && value === undefined ? "missing" : state, notices: [...envelope.notices] };
}
function unavailable(): MetricValue { return { dataState: "unavailable", notices: ["数据供应商暂时不可用"] }; }

export class MonitorSnapshotLoader {
  constructor(private readonly client: MonitorMarketClient) {}

  async load(conditions: ThesisCondition[], now: string): Promise<Map<string, MonitorSnapshot>> {
    const symbols = [...new Set(conditions.map((condition) => condition.symbol.toUpperCase()))].sort();
    const eventConditions = conditions.filter((condition) => condition.kind === "event");
    const eventTo = eventConditions.length ? eventConditions.map((condition) => condition.to).sort().at(-1)! : undefined;
    const eventFrom = eventConditions.length ? eventConditions.map((condition) => {
      const lowerBound = condition.occurrence === "within-range" && condition.from ? condition.from : condition.createdAt.slice(0, 10);
      return lowerBound > condition.to ? condition.to : lowerBound;
    }).sort()[0] : undefined;
    const [quotesResult, universeResult, eventsResult] = await Promise.allSettled([
      this.client.getQuotes(symbols),
      this.client.getUniverse(symbols),
      eventTo && eventFrom ? this.client.getEvents({ from: eventFrom, to: eventTo, symbols }) : Promise.resolve(undefined),
    ]);
    const snapshots = new Map(symbols.map((symbol) => [symbol, { symbol, metrics: {}, events: [], eventsState: eventTo ? "unavailable" as const : "fresh" as const, eventsAsOf: undefined, generatedAt: now }]));

    this.applyQuotes(snapshots, conditions, quotesResult);
    this.applyUniverse(snapshots, conditions, universeResult);
    if (eventTo) this.applyEvents(snapshots, eventsResult);
    return snapshots;
  }

  private applyQuotes(snapshots: Map<string, MonitorSnapshot>, conditions: ThesisCondition[], result: PromiseSettledResult<DataEnvelope<MarketQuote[]>>): void {
    const requested = new Map<string, Set<MonitorMetric>>();
    for (const condition of conditions) if (condition.kind === "metric" && quoteMetrics.has(condition.metric)) {
      const metrics = requested.get(condition.symbol) ?? new Set<MonitorMetric>(); metrics.add(condition.metric); requested.set(condition.symbol, metrics);
    }
    for (const [symbol, metrics] of requested) {
      const snapshot = snapshots.get(symbol)!;
      if (result.status === "rejected") { for (const metric of metrics) snapshot.metrics[metric] = unavailable(); continue; }
      const quote = result.value.data.find((item) => item.symbol.toUpperCase() === symbol);
      if (metrics.has("price")) snapshot.metrics.price = metricValue(quote?.price, result.value);
      if (metrics.has("dailyChangePercent")) snapshot.metrics.dailyChangePercent = metricValue(quote?.changePercent, result.value);
    }
  }

  private applyUniverse(snapshots: Map<string, MonitorSnapshot>, conditions: ThesisCondition[], result: PromiseSettledResult<DataEnvelope<DiscoveryUniverseSnapshot>>): void {
    const requested = new Map<string, Set<MonitorMetric>>();
    for (const condition of conditions) if (condition.kind === "metric" && universeMetrics.includes(condition.metric)) {
      const metrics = requested.get(condition.symbol) ?? new Set<MonitorMetric>(); metrics.add(condition.metric); requested.set(condition.symbol, metrics);
    }
    for (const [symbol, metrics] of requested) {
      const snapshot = snapshots.get(symbol)!;
      if (result.status === "rejected") { for (const metric of metrics) snapshot.metrics[metric] = unavailable(); continue; }
      const item = result.value.data.items.find((candidate) => candidate.symbol.toUpperCase() === symbol);
      for (const metric of metrics) snapshot.metrics[metric] = metricValue(item?.metrics[metric as keyof StockMetrics], result.value);
    }
  }

  private applyEvents(snapshots: Map<string, MonitorSnapshot>, result: PromiseSettledResult<DataEnvelope<MarketEvent[]> | undefined>): void {
    for (const snapshot of snapshots.values()) {
      if (result.status === "rejected" || !result.value) { snapshot.eventsState = "unavailable"; continue; }
      snapshot.events = structuredClone(result.value.data);
      snapshot.eventsState = envelopeState(result.value);
      snapshot.eventsAsOf = result.value.asOf;
    }
  }
}
