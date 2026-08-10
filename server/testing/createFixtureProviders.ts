import type {
  BarsAdjustment,
  BatchPriceBars,
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

  const defaultQuoteState = (): Record<string, { price: number; previousClose: number }> => Object.fromEntries(Object.entries({ SPY: 620, QQQ: 550, DIA: 440, IWM: 220, NVDA: 167.32, AAPL: 220, AMD: 158.11, MSFT: 505.41 }).map(([symbol, price]) => [symbol, { price, previousClose: price - 2 }]));
  const quoteState = defaultQuoteState();
  const historyDates = ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];
  const historyCloses: Record<string, number[]> = {
    NVDA: [100, 105, 52.5, 55],
    SPY: [620, 624, 628, 632],
    QQQ: [550, 555, 558, 563],
    DIA: [440, 442, 441, 445],
    IWM: [220, 221, 223, 224],
    MSFT: [495, 500, 502, 505],
    AAPL: [214, 216, 218, 220],
    AMD: [150, 153, 156, 158],
  };
  const barsFor = (symbol: string, adjustment: BarsAdjustment, start?: string, end?: string): PriceBar[] => {
    const closes = historyCloses[symbol];
    if (!closes) return [];
    return historyDates.flatMap((marketDate, index) => {
      if ((start && marketDate < start.slice(0, 10)) || (end && marketDate > end.slice(0, 10))) return [];
      const close = closes[index];
      return [{
        symbol,
        startedAt: `${marketDate}T20:00:00Z`,
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 50_000_000,
        adjusted: adjustment !== "raw",
      }];
    });
  };
  const alpaca = {
    async getMarketStatus(): Promise<ProviderResult<MarketStatus>> { maybeFail("alpaca"); return value("alpaca", { isOpen: true, session: "regular", nextClose: "2026-08-07T20:00:00Z" }); },
    async getQuotes(symbols: string[]): Promise<ProviderResult<MarketQuote[]>> { maybeFail("alpaca"); return { ...value("alpaca", symbols.map((symbol) => ({ symbol, price: quoteState[symbol]?.price, previousClose: quoteState[symbol]?.previousClose, currency: "USD", marketSession: "regular" as const }))), delayMinutes: 15 }; },
    async getBars(symbol: string): Promise<ProviderResult<PriceBar[]>> { maybeFail("alpaca"); return value("alpaca", [{ symbol, startedAt: "2026-08-06T00:00:00Z", open: 160, high: 168, low: 159, close: quoteState[symbol]?.price ?? 167.32, volume: 50_000_000, adjusted: false }]); },
    async getBatchBars(symbols: string[], query: { timeframe: "1Day"; adjustment: BarsAdjustment; start?: string; end?: string; feed?: "delayed_sip" | "iex" }): Promise<ProviderResult<BatchPriceBars>> { maybeFail("alpaca"); const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))]; const data = Object.fromEntries(normalized.map((symbol) => [symbol, barsFor(symbol, query.adjustment, query.start, query.end)])); return value("alpaca", { symbols: data, missingSymbols: normalized.filter((symbol) => data[symbol].length === 0) }); },
    async getNews(symbols: string[]): Promise<ProviderResult<CompanyNewsItem[]>> { maybeFail("alpaca"); return value("alpaca", [{ id: "alpaca:news:nvda-1", symbols, headline: "NVIDIA 发布新产品", summary: "测试新闻摘要", sourceName: "Benzinga", publishedAt: asOf, url: "https://example.test/news/nvda" }]); },
    async getCorporateActions(symbols: string[], from = "0000-01-01", to = "9999-12-31"): Promise<ProviderResult<MarketEvent[]>> {
      maybeFail("alpaca");
      const selected = symbols.length ? new Set(symbols.map((symbol) => symbol.toUpperCase())) : new Set(["NVDA"]);
      const events: MarketEvent[] = [
        {
          id: "alpaca:action:nvda-split",
          type: "split",
          symbol: "NVDA",
          title: "NVDA 2:1 拆股",
          scheduledAt: "2026-08-06",
          timing: "all-day",
          source: "alpaca",
          split: { oldRate: 1, newRate: 2, quantityMultiplier: 2, effectiveDate: "2026-08-06" },
        },
        {
          id: "alpaca:action:NVDA:dividend",
          type: "dividend",
          symbol: "NVDA",
          title: "NVDA 分红",
          scheduledAt: "2026-08-20",
          timing: "all-day",
          source: "alpaca",
        },
      ];
      return value("alpaca", events.filter((event) => (
        (!event.symbol || selected.has(event.symbol))
        && event.scheduledAt.slice(0, 10) >= from.slice(0, 10)
        && event.scheduledAt.slice(0, 10) <= to.slice(0, 10)
      )));
    },
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
  return {
    alpaca,
    finnhub,
    sec,
    fred,
    failNext(source: Source, code: FailureCode) { failures.set(source, code); },
    setQuote(symbol: string, price: number, previousClose = price) { quoteState[symbol.toUpperCase()] = { price, previousClose }; },
    reset() {
      failures.clear();
      for (const symbol of Object.keys(quoteState)) delete quoteState[symbol];
      Object.assign(quoteState, defaultQuoteState());
    },
  };
}
