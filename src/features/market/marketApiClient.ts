import type { CompanyProfile, DataEnvelope, FinancialFact, MacroObservation, MarketEvent, MarketQuote, MarketStatus, PriceBar, DiscoveryUniverseSnapshot, SecFiling } from "./apiDomain";

export class MarketApiError extends Error { constructor(public readonly code: string, message: string, public readonly retryable: boolean) { super(message); } }
export type RefreshRequest = { resource: "quotes"; symbols: string[] } | { resource: "bars"; symbol: string; timeframe: "1Min" | "1Day"; start: string; end: string } | { resource: "company" | "financials" | "filings" | "news"; symbol: string } | { resource: "events"; from: string; to: string; symbols?: string[] } | { resource: "macro"; ids: string[] };
export class MarketApiClient {
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), private readonly baseUrl = "") { this.fetcher = fetcher; }
  private async request<T>(path: string, init?: RequestInit): Promise<DataEnvelope<T>> { const response = await this.fetcher(`${this.baseUrl}${path}`, init); const body = await response.json(); if (!response.ok) throw new MarketApiError(body.code ?? "REQUEST_FAILED", body.message ?? "请求失败", Boolean(body.retryable)); return body as DataEnvelope<T>; }
  getMarketStatus() { return this.request<MarketStatus>("/api/market/status"); }
  getQuotes(symbols: string[]) { return this.request<MarketQuote[]>(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`); }
  async getQuote(symbol: string) { return (await this.getQuotes([symbol])).data[0]; }
  getBars(symbol: string, query: { timeframe: "1Min" | "1Day"; start: string; end: string }) { return this.request<PriceBar[]>(`/api/market/bars/${encodeURIComponent(symbol)}?${new URLSearchParams(query)}`); }
  getCompany(symbol: string) { return this.request<CompanyProfile>(`/api/companies/${encodeURIComponent(symbol)}`); }
  getFinancials(symbol: string) { return this.request<FinancialFact[]>(`/api/companies/${encodeURIComponent(symbol)}/financials`); }
  getFilings(symbol: string) { return this.request<SecFiling[]>(`/api/companies/${encodeURIComponent(symbol)}/filings`); }
  getNews(symbol: string, from = "", to = "") { return this.request<import("./apiDomain").CompanyNewsItem[]>(`/api/companies/${encodeURIComponent(symbol)}/news?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
  getUniverse(symbols?: string[]) { return this.request<DiscoveryUniverseSnapshot>(`/api/discovery/universe${symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : ""}`); }
  getEvents(query: { from: string; to: string; symbols?: string[] }) { return this.request<MarketEvent[]>(`/api/events?${new URLSearchParams({ from: query.from, to: query.to, ...(query.symbols?.length ? { symbols: query.symbols.join(",") } : {}) })}`); }
  getMacroSeries(ids: string[]) { return this.request<MacroObservation[]>(`/api/macro/series?ids=${encodeURIComponent(ids.join(","))}`); }
  refresh(request: RefreshRequest) { return this.request<unknown>("/api/cache/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }); }
}
