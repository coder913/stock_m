import { describe, expect, test, vi } from "vitest";
import type { DataEnvelope, DiscoveryUniverseSnapshot, MarketEvent, MarketQuote } from "../market/apiDomain";
import type { EventCondition, MetricCondition } from "./domain";
import { MonitorSnapshotLoader } from "./monitorSnapshotLoader";

const envelope = <T,>(data: T, source: DataEnvelope<T>["source"], overrides: Partial<DataEnvelope<T>> = {}): DataEnvelope<T> => ({ data, source, asOf: "2026-08-09T10:00:00Z", fetchedAt: "2026-08-09T10:00:01Z", expiresAt: "2026-08-09T10:01:00Z", stale: false, notices: [], ...overrides });

const priceCondition = (symbol: string): MetricCondition => ({ id: `price-${symbol}`, symbol, thesisVersionId: `thesis-${symbol}`, name: "价格", direction: "risk", severity: "high", kind: "metric", metric: "price", operator: ">=", target: 180, period: "CURRENT", createdAt: "2026-08-09T09:00:00Z", updatedAt: "2026-08-09T09:00:00Z" });
const revenueCondition = (symbol: string): MetricCondition => ({ ...priceCondition(symbol), id: `revenue-${symbol}`, metric: "revenueGrowthYoY", name: "收入增长", direction: "support", operator: ">", target: 20 });
const earningsCondition = (symbol: string): EventCondition => ({ id: `earnings-${symbol}`, symbol, thesisVersionId: `thesis-${symbol}`, name: "财报", direction: "support", severity: "medium", kind: "event", eventType: "earnings", occurrence: "before-date", to: "2026-08-31", createdAt: "2026-08-09T09:00:00Z", updatedAt: "2026-08-09T09:00:00Z" });

function completeMarketClient(overrides: Record<string, unknown> = {}) {
  const quotes: MarketQuote[] = [
    { symbol: "NVDA", price: 167.32, previousClose: 165, changePercent: 1.4, currency: "USD", marketSession: "regular" },
    { symbol: "MSFT", price: 505.41, previousClose: 500, changePercent: 1.08, currency: "USD", marketSession: "regular" },
  ];
  const universe: DiscoveryUniverseSnapshot = { version: "fixture", generatedAt: "2026-08-09T10:00:00Z", items: [
    { symbol: "NVDA", kind: "stock", metrics: { revenueGrowthYoY: 22 }, coverage: { status: "ready", availableMetrics: 1, totalMetrics: 1 } },
    { symbol: "MSFT", kind: "stock", metrics: { revenueGrowthYoY: 18 }, coverage: { status: "ready", availableMetrics: 1, totalMetrics: 1 } },
  ] };
  const events: MarketEvent[] = [{ id: "nvda-earnings", type: "earnings", symbol: "NVDA", title: "NVDA earnings", scheduledAt: "2026-08-28T20:00:00Z", timing: "after-market", source: "finnhub" }];
  return {
    getQuotes: vi.fn(async () => envelope(quotes, "alpaca")),
    getUniverse: vi.fn(async () => envelope(universe, "composite")),
    getEvents: vi.fn(async () => envelope(events, "finnhub")),
    ...overrides,
  };
}

describe("MonitorSnapshotLoader", () => {
  test("batches quotes, universe metrics, and one event window", async () => {
    const client = completeMarketClient();
    const snapshots = await new MonitorSnapshotLoader(client).load([priceCondition("NVDA"), revenueCondition("MSFT"), earningsCondition("NVDA")], "2026-08-09T10:00:00Z");

    expect(client.getQuotes).toHaveBeenCalledWith(["MSFT", "NVDA"]);
    expect(client.getUniverse).toHaveBeenCalledWith(["MSFT", "NVDA"]);
    expect(client.getEvents).toHaveBeenCalledWith({ from: "2026-08-09", to: "2026-08-31", symbols: ["MSFT", "NVDA"] });
    expect(snapshots.get("NVDA")?.metrics.price).toMatchObject({ value: 167.32, source: "alpaca", dataState: "fresh" });
    expect(snapshots.get("MSFT")?.metrics.revenueGrowthYoY).toMatchObject({ value: 18, source: "composite", dataState: "fresh" });
  });

  test("marks only the failed resource unavailable", async () => {
    const client = completeMarketClient({ getEvents: vi.fn(async () => { throw new Error("offline"); }) });
    const snapshot = (await new MonitorSnapshotLoader(client).load([priceCondition("NVDA"), earningsCondition("NVDA")], "2026-08-09T10:00:00Z")).get("NVDA")!;

    expect(snapshot.metrics.price?.dataState).toBe("fresh");
    expect(snapshot.eventsState).toBe("unavailable");
  });

  test("marks fallback envelopes stale and missing fields missing", async () => {
    const client = completeMarketClient({ getUniverse: vi.fn(async () => envelope({ version: "empty", generatedAt: "2026-08-09T09:00:00Z", items: [] }, "composite", { fallback: true })) });
    const snapshot = (await new MonitorSnapshotLoader(client).load([priceCondition("NVDA"), revenueCondition("NVDA")], "2026-08-09T10:00:00Z")).get("NVDA")!;

    expect(snapshot.metrics.price?.dataState).toBe("fresh");
    expect(snapshot.metrics.revenueGrowthYoY?.dataState).toBe("stale");
    expect(snapshot.metrics.revenueGrowthYoY?.value).toBeUndefined();
  });

  test("loads historical events from the condition lifetime without creating an inverted range", async () => {
    const client = completeMarketClient();
    const historical = { ...earningsCondition("NVDA"), createdAt: "2026-08-01T09:00:00Z", updatedAt: "2026-08-01T09:00:00Z", to: "2026-08-05" };

    await new MonitorSnapshotLoader(client).load([historical], "2026-08-09T10:00:00Z");

    expect(client.getEvents).toHaveBeenCalledWith({ from: "2026-08-01", to: "2026-08-05", symbols: ["NVDA"] });
  });

  test("uses an explicit within-range start for event batching", async () => {
    const client = completeMarketClient();
    const ranged = { ...earningsCondition("NVDA"), occurrence: "within-range" as const, from: "2026-07-15", to: "2026-08-31" };

    await new MonitorSnapshotLoader(client).load([ranged], "2026-08-09T10:00:00Z");

    expect(client.getEvents).toHaveBeenCalledWith({ from: "2026-07-15", to: "2026-08-31", symbols: ["NVDA"] });
  });
});
