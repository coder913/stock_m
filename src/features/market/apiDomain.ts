export type ProviderSource = "alpaca" | "sec" | "finnhub" | "fred";
export type DataSource = ProviderSource | "composite";

export interface DataEnvelope<T> {
  data: T;
  source: DataSource;
  asOf: string;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  fallback?: boolean;
  delayMinutes?: number;
  notices: string[];
}

export interface MarketQuote {
  symbol: string;
  price?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  currency: string;
  marketSession: "pre" | "regular" | "after" | "closed" | "unknown";
}

export interface MarketStatus {
  isOpen: boolean;
  session: "pre" | "regular" | "after" | "closed";
  nextOpen?: string;
  nextClose?: string;
}

export interface PriceBar {
  symbol: string;
  startedAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  adjusted: boolean;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange?: string;
  industry?: string;
  sector?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  marketCapitalization?: number;
  currency?: string;
  cik?: string;
}

export interface FinancialFact {
  symbol: string;
  statement: "income" | "balance-sheet" | "cash-flow";
  concept: string;
  label: string;
  value: number;
  unit: string;
  periodStart?: string;
  periodEnd: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  form: string;
  filedAt: string;
  accessionNumber: string;
}

export interface SecFiling {
  symbol: string;
  form: "10-K" | "10-K/A" | "10-Q" | "10-Q/A" | "8-K" | "8-K/A";
  filedAt: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  url: string;
}

export interface MarketEvent {
  id: string;
  type: "earnings" | "dividend" | "split" | "corporate-action" | "macro";
  symbol?: string;
  title: string;
  scheduledAt: string;
  timing: "before-market" | "during-market" | "after-market" | "all-day" | "unknown";
  source: ProviderSource;
  sourceUrl?: string;
}

export interface CompanyNewsItem {
  id: string;
  symbols: string[];
  headline: string;
  summary?: string;
  sourceName: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
}

export interface MacroObservation {
  seriesId: string;
  label: string;
  value: number;
  unit: string;
  observedAt: string;
}

export interface StockMetrics {
  price?: number;
  dailyChangePercent?: number;
  revenueGrowthYoY?: number;
  epsGrowthYoY?: number;
  grossMargin?: number;
  freeCashFlow?: number;
  freeCashFlowYield?: number;
  netDebtToEbitda?: number;
  earningsSurprise?: number;
  grossMarginYoYChange?: number;
  priceVs20DayHigh?: number;
  relativeVolume?: number;
  averageDollarVolume20d?: number;
  operatingMargin?: number;
  return3Months?: number;
  beta?: number;
  grossMarginVsIndustryMedian?: number;
  forwardPE?: number;
  forwardPEToIndustryMedian?: number;
  peg?: number;
  nextFyEpsRevision30d?: number;
}

export interface UniverseCoverage { status: "ready" | "preparing" | "partial" | "unavailable"; availableMetrics: number; totalMetrics: number; }
export interface UniverseStockSnapshot { symbol: string; kind: "stock" | "etf"; name?: string; sector?: string; marketCapitalization?: number; metrics: StockMetrics; coverage: UniverseCoverage; }
export interface DiscoveryUniverseSnapshot { version: string; items: UniverseStockSnapshot[]; generatedAt: string; }
export interface MarketTheme { id: string; name: string; symbols: string[]; changePercent?: number; coverage: UniverseCoverage; etfSymbol?: string; valuationDeviation?: number; }
