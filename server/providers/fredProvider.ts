import { z } from "zod";
import type { MacroObservation, MarketEvent } from "../../src/features/market/apiDomain";
import type { ProviderResult } from "../core/providerTypes";
import { ProviderTimeoutError } from "../core/errors";

export const macroSeries = {
  federalFundsRate: "FEDFUNDS",
  cpi: "CPIAUCSL",
  coreCpi: "CPILFESL",
  pce: "PCEPI",
  corePce: "PCEPILFE",
  nonfarmPayrolls: "PAYEMS",
  unemploymentRate: "UNRATE",
  realGdp: "GDPC1",
} as const;

const approvedReleaseIds = new Set([10, 18, 50, 53, 54]);
const fredAttribution = "Data: FRED, Federal Reserve Bank of St. Louis";
const releaseCalendarUrl = "https://fred.stlouisfed.org/releases/calendar";

export class FredProvider {
  constructor(private readonly apiKey?: string, private readonly fetcher: typeof fetch = fetch) {}

  async getSeries(ids: string[]): Promise<ProviderResult<MacroObservation[]>> {
    if (!this.apiKey) throw new ProviderTimeoutError("fred");
    const data = await Promise.all(ids.map(async (id) => {
      const query = new URLSearchParams({ series_id: id, api_key: this.apiKey!, file_type: "json" });
      const response = await this.fetcher(`https://api.stlouisfed.org/fred/series/observations?${query}`);
      if (!response.ok) throw new ProviderTimeoutError("fred");
      const payload = z.object({
        observations: z.array(z.object({ date: z.string(), value: z.string() })),
      }).parse(await response.json());
      const latest = payload.observations.filter((item) => item.value !== ".").at(-1);
      if (!latest) throw new ProviderTimeoutError("fred");
      return { seriesId: id, label: id, value: Number(latest.value), unit: "FRED", observedAt: latest.date };
    }));
    return { source: "fred", asOf: new Date().toISOString(), notices: [fredAttribution], data };
  }

  async getReleaseEvents(from: string, to: string): Promise<ProviderResult<MarketEvent[]>> {
    if (!this.apiKey) throw new ProviderTimeoutError("fred");
    const query = new URLSearchParams({
      api_key: this.apiKey,
      file_type: "json",
      realtime_start: from,
      realtime_end: to,
      order_by: "release_date",
      sort_order: "asc",
      include_release_dates_with_no_data: "true",
      limit: "1000",
    });
    const response = await this.fetcher(`https://api.stlouisfed.org/fred/releases/dates?${query}`);
    if (!response.ok) throw new ProviderTimeoutError("fred");
    const payload = z.object({
      release_dates: z.array(z.object({
        release_id: z.coerce.number().int(),
        release_name: z.string(),
        date: z.string(),
      })),
    }).parse(await response.json());
    const data = payload.release_dates
      .filter((release) => approvedReleaseIds.has(release.release_id) && release.date >= from && release.date <= to)
      .map<MarketEvent>((release) => ({
        id: `fred:release:${release.release_id}:${release.date}`,
        type: "macro",
        title: release.release_name,
        scheduledAt: release.date,
        timing: "all-day",
        source: "fred",
        sourceUrl: releaseCalendarUrl,
      }));
    return {
      source: "fred",
      asOf: new Date().toISOString(),
      notices: [fredAttribution],
      data: [...new Map(data.map((event) => [event.id, event])).values()],
    };
  }
}
