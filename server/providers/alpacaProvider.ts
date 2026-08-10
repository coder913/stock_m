import { z } from "zod";
import type { BarsAdjustment, BatchPriceBars, CompanyNewsItem, MarketEvent, MarketQuote, MarketStatus, PriceBar } from "../../src/features/market/apiDomain";
import { ProviderRateLimitError, ProviderTimeoutError } from "../core/errors";
import type { ProviderResult } from "../core/providerTypes";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const snapshotSchema = z.record(z.string(), z.object({ latestTrade: z.object({ p: z.number(), t: z.string() }).optional(), latestQuote: z.object({ bp: z.number().optional(), ap: z.number().optional() }).optional(), dailyBar: z.object({ c: z.number().optional(), v: z.number().optional() }).optional(), previousDailyBar: z.object({ c: z.number().optional() }).optional() }));
const barsSchema = z.object({ bars: z.array(z.object({ t: z.string(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number().optional() })) });
const batchBarsSchema = z.object({
  bars: z.record(
    z.string(),
    z.array(z.object({
      t: z.string(),
      o: z.number(),
      h: z.number(),
      l: z.number(),
      c: z.number(),
      v: z.number().optional(),
    })),
  ),
  next_page_token: z.string().nullable().optional(),
});

export class AlpacaProvider {
  constructor(private readonly credentials: { keyId: string; secretKey: string } | undefined, private readonly fetcher: FetchLike = fetch) {}

  async getQuotes(symbols: string[], feed: "delayed_sip" | "iex" = "delayed_sip"): Promise<ProviderResult<MarketQuote[]>> {
    const normalizedSymbols = symbols.map((symbol) => symbol.toUpperCase());
    const response = await this.request(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(normalizedSymbols.join(","))}&feed=${feed}`);
    const payload = snapshotSchema.parse(await response.json());
    const data = normalizedSymbols.map((symbol) => {
      const item = payload[symbol];
      const price = item?.latestTrade?.p;
      const previousClose = item?.previousDailyBar?.c;
      return { symbol, price, previousClose, change: price === undefined || previousClose === undefined ? undefined : price - previousClose, changePercent: price === undefined || previousClose === undefined || previousClose === 0 ? undefined : ((price / previousClose) - 1) * 100, bid: item?.latestQuote?.bp, ask: item?.latestQuote?.ap, volume: item?.dailyBar?.v, currency: "USD", marketSession: "regular" as const };
    });
    const asOf = Object.values(payload).flatMap((item) => item.latestTrade?.t ? [item.latestTrade.t] : []).sort().at(-1) ?? new Date(0).toISOString();
    return { source: "alpaca", asOf, delayMinutes: feed === "delayed_sip" ? 15 : undefined, notices: feed === "iex" ? ["IEX 单交易所数据"] : ["SIP 延迟 15 分钟数据"], data };
  }

  async getBars(symbol: string, query: { timeframe: "1Min" | "1Day"; start: string; end: string; feed?: "delayed_sip" | "iex" }): Promise<ProviderResult<PriceBar[]>> {
    const response = await this.request(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${query.timeframe}&start=${encodeURIComponent(query.start)}&end=${encodeURIComponent(query.end)}&feed=${query.feed ?? "delayed_sip"}`);
    const payload = barsSchema.parse(await response.json());
    return { source: "alpaca", asOf: payload.bars.at(-1)?.t ?? query.end, delayMinutes: query.feed === "iex" ? undefined : 15, data: payload.bars.map((bar) => ({ symbol, startedAt: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, adjusted: false })) };
  }

  async getBatchBars(
    symbols: string[],
    query: {
      timeframe: "1Day";
      start: string;
      end: string;
      adjustment: BarsAdjustment;
      feed?: "delayed_sip" | "iex";
    },
  ): Promise<ProviderResult<BatchPriceBars>> {
    const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const data: Record<string, PriceBar[]> = Object.fromEntries(
      normalizedSymbols.map((symbol) => [symbol, []]),
    );
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        symbols: normalizedSymbols.join(","),
        timeframe: query.timeframe,
        start: query.start,
        end: query.end,
        feed: query.feed ?? "delayed_sip",
        adjustment: query.adjustment,
        limit: "10000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const response = await this.request(`https://data.alpaca.markets/v2/stocks/bars?${params}`);
      const payload = batchBarsSchema.parse(await response.json());
      for (const [symbol, bars] of Object.entries(payload.bars)) {
        if (!data[symbol]) data[symbol] = [];
        data[symbol].push(...bars.map((bar) => ({
          symbol,
          startedAt: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
          adjusted: query.adjustment !== "raw",
        })));
      }
      pageToken = payload.next_page_token ?? undefined;
    } while (pageToken);

    for (const bars of Object.values(data)) {
      bars.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    }
    const asOf = Object.values(data)
      .flat()
      .map((bar) => bar.startedAt)
      .sort()
      .at(-1) ?? query.end;
    return {
      source: "alpaca",
      asOf,
      delayMinutes: query.feed === "iex" ? undefined : 15,
      data: {
        symbols: data,
        missingSymbols: normalizedSymbols.filter((symbol) => data[symbol].length === 0),
      },
    };
  }

  async getMarketStatus(): Promise<ProviderResult<MarketStatus>> {
    const response = await this.request("https://paper-api.alpaca.markets/v2/clock");
    const clock = z.object({ is_open: z.boolean(), next_open: z.string().optional(), next_close: z.string().optional() }).parse(await response.json());
    return { source: "alpaca", asOf: new Date().toISOString(), data: { isOpen: clock.is_open, session: clock.is_open ? "regular" : "closed", nextOpen: clock.next_open, nextClose: clock.next_close } };
  }
  async getNews(symbols: string[], from: string, to: string): Promise<ProviderResult<CompanyNewsItem[]>> { const response = await this.request(`https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(symbols.join(","))}&start=${from}&end=${to}`); const payload = z.object({ news: z.array(z.object({ id: z.union([z.string(), z.number()]), headline: z.string(), summary: z.string().optional(), author: z.string().optional(), created_at: z.string(), url: z.string(), symbols: z.array(z.string()).optional(), images: z.array(z.object({ url: z.string() })).optional() })) }).parse(await response.json()); return { source: "alpaca", asOf: new Date().toISOString(), data: payload.news.map((item) => ({ id: `alpaca:news:${item.id}`, symbols: item.symbols ?? symbols, headline: item.headline, summary: item.summary, sourceName: item.author ?? "Alpaca News", publishedAt: item.created_at, url: item.url, imageUrl: item.images?.[0]?.url })) }; }
  async getCorporateActions(symbols: string[], from: string, to: string): Promise<ProviderResult<MarketEvent[]>> { const response = await this.request(`https://data.alpaca.markets/v1/corporate-actions?symbols=${encodeURIComponent(symbols.join(","))}&start=${from}&end=${to}`); const payload = z.object({ corporate_actions: z.array(z.object({ id: z.union([z.string(), z.number()]), symbol: z.string(), type: z.string(), date: z.string() })) }).parse(await response.json()); return { source: "alpaca", asOf: new Date().toISOString(), data: payload.corporate_actions.map((item) => ({ id: `alpaca:action:${item.id}`, type: item.type.includes("dividend") ? "dividend" : item.type.includes("split") ? "split" : "corporate-action", symbol: item.symbol, title: `${item.symbol} ${item.type}`, scheduledAt: item.date, timing: "all-day", source: "alpaca" })) }; }

  private async request(url: string): Promise<Response> {
    try {
      if (!this.credentials) throw new ProviderTimeoutError("alpaca");
      const response = await this.fetcher(url, { headers: { "APCA-API-KEY-ID": this.credentials.keyId, "APCA-API-SECRET-KEY": this.credentials.secretKey } });
      if (response.status === 429) throw new ProviderRateLimitError("alpaca", response.headers.get("retry-after") ?? new Date(Date.now() + 60_000).toISOString());
      if (!response.ok) throw new ProviderTimeoutError("alpaca");
      return response;
    } catch (error) {
      if (error instanceof ProviderRateLimitError || error instanceof ProviderTimeoutError) throw error;
      throw new ProviderTimeoutError("alpaca");
    }
  }
}
