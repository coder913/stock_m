import type { CompanyEvent, MarketTheme, StockSnapshot } from "./domain";
import type { DiscoveryRepository, DiscoverySnapshot } from "./discoveryRepository";

const source = "stock_m demo dataset";
const updatedAt = "2026-08-06T13:30:00-04:00";
const envelope = <T,>(items: T[]): DiscoverySnapshot<T> => structuredClone({ items, source, updatedAt, freshness: { kind: "delayed" as const, minutes: 15 } });

const events: CompanyEvent[] = [
  { id: "nvda-earnings", symbol: "NVDA", date: "2026-08-27", type: "earnings", title: "NVDA 财报", status: "confirmed", source },
  { id: "aapl-dividend", symbol: "AAPL", date: "2026-08-14", type: "dividend", title: "AAPL 除息日", status: "confirmed", source },
  { id: "amd-earnings", symbol: "AMD", date: "2026-08-12", type: "earnings", title: "AMD 财报", status: "expected", source },
];

const stocks: StockSnapshot[] = [
  { symbol: "NVDA", name: "英伟达", industry: "半导体", nextEvent: events[0], metrics: { price: 167.32, dailyChangePercent: 2.91, revenueGrowthYoY: 35, epsGrowthYoY: 42, grossMarginVsIndustryMedian: 12, freeCashFlow: 61700, forwardPE: 32, forwardPEToIndustryMedian: 1.15, peg: 1.2, freeCashFlowYield: 2.4, netDebtToEbitda: -0.2, earningsSurprise: 8, nextFyEpsRevision30d: 5, grossMarginYoYChange: 1.4, priceVs20DayHigh: 1.2, relativeVolume: 1.8, averageDollarVolume20d: 42500, marketCap: 4100000, operatingMargin: 62, return3Months: 18, beta: 1.7 } },
  { symbol: "AAPL", name: "苹果", industry: "硬件", nextEvent: events[1], metrics: { price: 218.72, dailyChangePercent: -0.86, revenueGrowthYoY: 8, epsGrowthYoY: 9, grossMarginVsIndustryMedian: 11, freeCashFlow: 108000, forwardPE: 26, forwardPEToIndustryMedian: 1.1, peg: 2.1, freeCashFlowYield: 3, netDebtToEbitda: 0.4, earningsSurprise: 2, nextFyEpsRevision30d: 1, grossMarginYoYChange: 0.5, priceVs20DayHigh: -3, relativeVolume: 0.9, averageDollarVolume20d: 8900, marketCap: 3250000, operatingMargin: 32, return3Months: 5, beta: 1.1 } },
  { symbol: "MSFT", name: "微软", industry: "软件", metrics: { price: 505.41, dailyChangePercent: 1.08, revenueGrowthYoY: 16, epsGrowthYoY: 18, grossMarginVsIndustryMedian: 15, freeCashFlow: 74000, forwardPE: 30, forwardPEToIndustryMedian: 1.2, peg: 1.8, freeCashFlowYield: 2.1, netDebtToEbitda: -0.1, earningsSurprise: 4, nextFyEpsRevision30d: 2, grossMarginYoYChange: 0.8, priceVs20DayHigh: -1, relativeVolume: 1.1, averageDollarVolume20d: 7600, marketCap: 3750000, operatingMargin: 45, return3Months: 12, beta: 0.9 } },
  { symbol: "AMZN", name: "亚马逊", industry: "互联网零售", metrics: { price: 225.13, dailyChangePercent: 0.45, revenueGrowthYoY: 12, epsGrowthYoY: 26, grossMarginVsIndustryMedian: 7, freeCashFlow: 36500, forwardPE: 34, forwardPEToIndustryMedian: 1.4, peg: 2.3, freeCashFlowYield: 1.9, netDebtToEbitda: 0.1, earningsSurprise: 3, nextFyEpsRevision30d: 1.5, grossMarginYoYChange: 0.3, priceVs20DayHigh: -2, relativeVolume: 1.2, averageDollarVolume20d: 9100, marketCap: 2350000, operatingMargin: 11, return3Months: 9, beta: 1.2 } },
  { symbol: "AMD", name: "超威半导体", industry: "半导体", nextEvent: events[2], metrics: { price: 158.11, dailyChangePercent: 3.2, revenueGrowthYoY: 24, epsGrowthYoY: 30, grossMarginVsIndustryMedian: 3, freeCashFlow: 2100, forwardPE: 38, forwardPEToIndustryMedian: 1.35, peg: 1.9, freeCashFlowYield: 1.2, netDebtToEbitda: -0.4, earningsSurprise: 6, nextFyEpsRevision30d: 4, grossMarginYoYChange: 1, priceVs20DayHigh: 2, relativeVolume: 2.1, averageDollarVolume20d: 5300, marketCap: 256000, operatingMargin: 20, return3Months: 24, beta: 1.6 } },
  { symbol: "LLY", name: "礼来", industry: "制药", metrics: { price: 780.2, dailyChangePercent: -0.22, revenueGrowthYoY: 18, epsGrowthYoY: 22, grossMarginVsIndustryMedian: 8, freeCashFlow: 5400, forwardPE: 41, forwardPEToIndustryMedian: 1.3, peg: 1.7, freeCashFlowYield: 1.5, netDebtToEbitda: 1.4, earningsSurprise: 5, nextFyEpsRevision30d: 2, grossMarginYoYChange: 0.6, priceVs20DayHigh: -4, relativeVolume: 0.8, averageDollarVolume20d: 1800, marketCap: 741000, operatingMargin: 30, return3Months: 6, beta: 0.4 } },
  { symbol: "XOM", name: "埃克森美孚", industry: "能源", metrics: { price: 114.7, dailyChangePercent: -1.1, revenueGrowthYoY: undefined, epsGrowthYoY: -8, grossMarginVsIndustryMedian: 2, freeCashFlow: 31200, forwardPE: 13, forwardPEToIndustryMedian: 0.9, peg: undefined, freeCashFlowYield: 5.8, netDebtToEbitda: 0.2, earningsSurprise: -2, nextFyEpsRevision30d: -1, grossMarginYoYChange: -0.4, priceVs20DayHigh: -5, relativeVolume: 1, averageDollarVolume20d: 2400, marketCap: 488000, operatingMargin: 12, return3Months: -4, beta: 0.7 } },
];

const themes: MarketTheme[] = [
  { id: "semis", name: "半导体", kind: "industry", marketCapWeight: 32, changePercent: 2.4, valuationDeviation: 8 },
  { id: "software", name: "软件", kind: "industry", marketCapWeight: 24, changePercent: 1.1, valuationDeviation: 3 },
  { id: "ai", name: "AI 基础设施", kind: "theme", marketCapWeight: 28, changePercent: 2.8, valuationDeviation: 10 },
];

export const mockDiscoveryRepository: DiscoveryRepository = {
  async listStocks() { return envelope(stocks); },
  async listThemes() { return envelope(themes); },
  async listEvents() { return envelope(events); },
  async getPeers(symbol) {
    const stock = stocks.find((item) => item.symbol === symbol.toUpperCase());
    if (!stock) throw new Error(`未找到股票 ${symbol}`);
    return envelope(stocks.filter((item) => item.industry === stock.industry && item.symbol !== stock.symbol).slice(0, 5));
  },
};
