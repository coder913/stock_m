import type { FastifyInstance } from "fastify";
import type { DataEnvelope, MarketEvent } from "../../src/features/market/apiDomain";
import type { MarketDataGateway } from "../core/marketDataGateway";
import type { RefreshRegistry } from "../core/refreshRegistry";
import type { ProviderResult } from "../core/providerTypes";

export interface EventsProvider {
  getEarnings(from: string, to: string, symbols?: string[]): Promise<ProviderResult<MarketEvent[]>>;
  getCorporateActions?(symbols: string[], from: string, to: string): Promise<ProviderResult<MarketEvent[]>>;
  getReleaseEvents?(from: string, to: string): Promise<ProviderResult<MarketEvent[]>>;
}

const sortEvents = (left: MarketEvent, right: MarketEvent) => {
  const dateOrder = left.scheduledAt.slice(0, 10).localeCompare(right.scheduledAt.slice(0, 10));
  if (dateOrder) return dateOrder;
  if (left.timing === "all-day" && right.timing !== "all-day") return 1;
  if (right.timing === "all-day" && left.timing !== "all-day") return -1;
  return left.scheduledAt.localeCompare(right.scheduledAt);
};

export function registerEventRoutes(
  app: FastifyInstance,
  dependencies: { gateway: MarketDataGateway; provider: EventsProvider; refreshRegistry: RefreshRegistry },
): void {
  const events = async (from: string, to: string, symbols?: string[], forceRefresh = false): Promise<DataEnvelope<MarketEvent[]>> => {
    const symbolKey = symbols?.slice().sort().join(",") ?? "";
    const groups: Array<{ label: string; request: Promise<DataEnvelope<MarketEvent[]>> }> = [
      {
        label: "财报",
        request: dependencies.gateway.readThrough({
          key: `events:earnings:${from}:${to}:${symbolKey}`,
          source: "finnhub",
          ttlMs: 21_600_000,
          forceRefresh,
          load: () => dependencies.provider.getEarnings(from, to, symbols),
        }),
      },
    ];
    if (dependencies.provider.getCorporateActions) {
      groups.push({
        label: "公司行为",
        request: dependencies.gateway.readThrough({
          key: `events:actions:${from}:${to}:${symbolKey}`,
          source: "alpaca",
          ttlMs: 21_600_000,
          forceRefresh,
          load: () => dependencies.provider.getCorporateActions!(symbols ?? [], from, to),
        }),
      });
    }
    if (dependencies.provider.getReleaseEvents) {
      groups.push({
        label: "宏观",
        request: dependencies.gateway.readThrough({
          key: `events:macro:${from}:${to}`,
          source: "fred",
          ttlMs: 86_400_000,
          forceRefresh,
          load: () => dependencies.provider.getReleaseEvents!(from, to),
        }),
      });
    }

    const settled = await Promise.allSettled(groups.map((group) => group.request));
    const successful = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failedLabels = settled.flatMap((result, index) => result.status === "rejected" ? [groups[index].label] : []);
    const fallbackLabels = settled.flatMap((result, index) => result.status === "fulfilled" && result.value.fallback ? [groups[index].label] : []);
    const unavailableLabels = [...new Set([...failedLabels, ...fallbackLabels])];
    const now = new Date().toISOString();
    const data = [...new Map(successful.flatMap((envelope) => envelope.data).map((event) => [`${event.source}:${event.id}`, event])).values()].sort(sortEvents);
    return {
      data,
      source: "composite",
      asOf: successful.map((envelope) => envelope.asOf).sort().at(-1) ?? now,
      fetchedAt: now,
      expiresAt: successful.map((envelope) => envelope.expiresAt).sort().at(0) ?? now,
      stale: successful.some((envelope) => envelope.stale),
      notices: [
        ...new Set(successful.flatMap((envelope) => envelope.notices)),
        ...(unavailableLabels.length ? [`部分事件数据暂不可用：${unavailableLabels.join("、")}`] : []),
      ],
    };
  };

  app.get("/api/events", (request) => {
    const query = request.query as { from: string; to: string; symbols?: string };
    return events(query.from, query.to, query.symbols?.split(","));
  });
  dependencies.refreshRegistry.register("events", (payload) => events(
    String(payload.from),
    String(payload.to),
    payload.symbols as string[] | undefined,
    true,
  ));
}
