import { z } from "zod";
import type { CompanyProfile, MarketEvent } from "../../src/features/market/apiDomain";
import type { ProviderResult } from "../core/providerTypes";
import { ProviderTimeoutError } from "../core/errors";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const profileSchema = z.object({ ticker: z.string(), name: z.string(), exchange: z.string().optional(), finnhubIndustry: z.string().optional(), marketCapitalization: z.number().optional(), weburl: z.string().optional() });
const earningsSchema = z.object({ earningsCalendar: z.array(z.object({ date: z.string(), hour: z.string().optional(), symbol: z.string(), epsActual: z.number().nullable().optional(), epsEstimate: z.number().nullable().optional(), revenueActual: z.number().nullable().optional(), revenueEstimate: z.number().nullable().optional() })) });

export class FinnhubProvider {
  constructor(private readonly apiKey: string | undefined, private readonly fetcher: FetchLike = fetch) {}
  async getCompanyProfile(symbol: string): Promise<ProviderResult<CompanyProfile>> {
    const payload = profileSchema.parse(await this.json(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol.toUpperCase())}`));
    return { source: "finnhub", asOf: new Date().toISOString(), data: { symbol: payload.ticker.toUpperCase(), name: payload.name, exchange: payload.exchange, industry: payload.finnhubIndustry, marketCapitalization: payload.marketCapitalization, website: payload.weburl, currency: "USD" } };
  }
  async getEarnings(from: string, to: string, symbols?: string[]): Promise<ProviderResult<MarketEvent[]>> {
    const symbol = symbols?.join(",") ?? "";
    const payload = earningsSchema.parse(await this.json(`https://finnhub.io/api/v1/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&symbol=${encodeURIComponent(symbol)}`));
    return { source: "finnhub", asOf: new Date().toISOString(), data: payload.earningsCalendar.map((item) => ({ id: `finnhub:earnings:${item.symbol}:${item.date}`, type: "earnings" as const, symbol: item.symbol.toUpperCase(), title: `${item.symbol.toUpperCase()} 财报`, scheduledAt: item.date, timing: item.hour === "amc" ? "after-market" as const : item.hour === "bmo" ? "before-market" as const : "all-day" as const, source: "finnhub" as const })) };
  }
  private async json(url: string): Promise<unknown> {
    try {
      if (!this.apiKey) throw new ProviderTimeoutError("finnhub");
      const response = await this.fetcher(`${url}&token=${encodeURIComponent(this.apiKey)}`);
      if (!response.ok) throw new ProviderTimeoutError("finnhub");
      return response.json();
    } catch (error) { if (error instanceof ProviderTimeoutError) throw error; throw new ProviderTimeoutError("finnhub"); }
  }
}
