import type {
  CompanyNewsItem,
  CompanyProfile,
  FinancialFact,
  MacroObservation,
  MarketEvent,
  MarketQuote,
  MarketStatus,
  PriceBar,
  SecFiling,
} from "../../src/features/market/apiDomain";
import { ProviderRateLimitError, ProviderTimeoutError } from "../core/errors";
import type { ProviderResult } from "../core/providerTypes";

type Source = "alpaca" | "sec" | "finnhub" | "fred";
type FailureCode = 429 | 503;
const asOf = "2026-08-07T14:00:00Z";
const value = <T>(source: Source, data: T): ProviderResult<T> => ({ source, asOf, data });

export function createFixtureProviders() {
  const failures = new Map<Source, FailureCode>();
  const maybeFail = (source: Source) => {
    const code = failures.get(source);
    failures.delete(source);
    if (code === 429) throw new ProviderRateLimitError(source, "2026-08-07T14:05:00Z");
    if (code === 503) throw new ProviderTimeoutError(source);
  };

  const prices: Record<string, number> = { SPY: 620, QQQ: 550, DIA: 440, IWM: 220, NVDA: 167.32, AAPL: 220, AMD: 158.11, MSFT: 505.41 };
  const alpaca = {
    async getMarketStatus(): Promise<ProviderResult<MarketStatus>> { maybeFail("alpaca"); return value("alpaca", { isOpen: true, session: "regular", nextClose: "2026-08-07T20:00:00Z" }); },
    async getQuotes(symbols: string[]): Promise<ProviderResult<MarketQuote[]>> { maybeFail("alpaca"); return { ...value("alpaca", symbols.map((symbol) => ({ symbol, price: prices[symbol], previousClose: prices[symbol] ? prices[symbol] - 2 : undefined, currency: "USD", marketSession: "regular" as const }))), delayMinutes: 15 }; },
    async getBars(symbol: string): Promise<ProviderResult<PriceBar[]>> { maybeFail("alpaca"); return value("alpaca", [{ symbol, startedAt: "2026-08-06T00:00:00Z", open: 160, high: 168, low: 159, close: prices[symbol] ?? 167.32, volume: 50_000_000, adjusted: false }]); },
    async getNews(symbols: string[]): Promise<ProviderResult<CompanyNewsItem[]>> { maybeFail("alpaca"); return value("alpaca", [{ id: "alpaca:news:nvda-1", symbols, headline: "NVIDIA 发布新产品", summary: "测试新闻摘要", sourceName: "Benzinga", publishedAt: asOf, url: "https://example.test/news/nvda" }]); },
    async getCorporateActions(symbols: string[], _from?: string, _to?: string): Promise<ProviderResult<MarketEvent[]>> { maybeFail("alpaca"); const symbol = symbols[0] ?? "NVDA"; return value("alpaca", [{ id: `alpaca:action:${symbol}:dividend`, type: "dividend", symbol, title: `${symbol} 分红`, scheduledAt: "2026-08-20", timing: "all-day", source: "alpaca" }]); },
  };
  const finnhub = {
    async getCompanyProfile(symbol: string): Promise<ProviderResult<CompanyProfile>> { maybeFail("finnhub"); return value("finnhub", { symbol, name: symbol === "NVDA" ? "NVIDIA Corp" : symbol, exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapitalization: 4_000_000, currency: "USD" }); },
    async getEarnings(_from: string, _to: string, symbols?: string[]): Promise<ProviderResult<MarketEvent[]>> { maybeFail("finnhub"); const symbol = symbols?.[0] ?? "NVDA"; return value("finnhub", [{ id: `finnhub:earnings:${symbol}:2026-08-27`, type: "earnings", symbol, title: `${symbol} 财报`, scheduledAt: "2026-08-27", timing: "after-market", source: "finnhub" }]); },
  };
  const sec = {
    async getFinancialFacts(symbol: string): Promise<ProviderResult<FinancialFact[]>> { maybeFail("sec"); const fact = (statement: FinancialFact["statement"], concept: string, label: string, amount: number, periodEnd: string, accessionNumber: string): FinancialFact => ({ symbol, statement, concept, label, value: amount, unit: "USD", periodEnd, form: "10-K", filedAt: "2026-03-01", accessionNumber }); return value("sec", [fact("income", "Revenues", "营业收入", 130_500, "2026-01-31", "a"), fact("income", "Revenues", "营业收入", 100_000, "2025-01-31", "b"), fact("income", "OperatingIncomeLoss", "营业利润", 40_000, "2026-01-31", "a"), fact("cash-flow", "NetCashProvidedByUsedInOperatingActivities", "经营现金流", 35_000, "2026-01-31", "a"), fact("cash-flow", "PaymentsToAcquirePropertyPlantAndEquipment", "资本开支", 5_000, "2026-01-31", "a")]); },
    async getFilings(symbol: string): Promise<ProviderResult<SecFiling[]>> { maybeFail("sec"); return value("sec", [{ symbol, form: "10-K", filedAt: "2026-03-01", reportDate: "2026-01-31", accessionNumber: "0001045810-26-000042", primaryDocument: "nvda.htm", url: "https://example.test/sec/nvda-10k" }]); },
  };
  const fred = {
    async getSeries(ids: string[]): Promise<ProviderResult<MacroObservation[]>> { maybeFail("fred"); return { ...value("fred", ids.map((seriesId) => ({ seriesId, label: seriesId === "CPIAUCSL" ? "美国 CPI" : seriesId, value: 330.1, unit: "Index 1982-1984=100", observedAt: "2026-07-01" }))), notices: ["Data: FRED, Federal Reserve Bank of St. Louis"] }; },
    async getReleaseEvents(_from?: string, _to?: string): Promise<ProviderResult<MarketEvent[]>> { maybeFail("fred"); return value("fred", [{ id: "fred:release:cpi:2026-08-12", type: "macro", title: "美国 CPI", scheduledAt: "2026-08-12", timing: "all-day", source: "fred" }]); },
  };
  return { alpaca, finnhub, sec, fred, failNext(source: Source, code: FailureCode) { failures.set(source, code); } };
}
