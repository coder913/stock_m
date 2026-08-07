import type { FinancialFact, MarketQuote, PriceBar, StockMetrics } from "../../src/features/market/apiDomain";

export interface MetricInput { quote?: Pick<MarketQuote, "price" | "previousClose" | "volume">; dailyBars?: PriceBar[]; financials?: FinancialFact[]; marketCapUsdMillions?: number; }
const ratio = (numerator?: number, denominator?: number) => numerator === undefined || !denominator ? undefined : numerator / denominator;
const fact = (facts: FinancialFact[] | undefined, concept: string) => facts?.filter((item) => item.concept === concept).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).map((item) => item.value) ?? [];

export function calculateScreenerMetrics(input: MetricInput): Partial<StockMetrics> {
  const price = input.quote?.price;
  const bars = input.dailyBars ?? [];
  const latest = bars.at(-1);
  const high20 = bars.slice(-20).reduce<number | undefined>((max, bar) => max === undefined ? bar.high : Math.max(max, bar.high), undefined);
  const averageVolume20 = bars.slice(-20).reduce((sum, bar) => sum + (bar.volume ?? 0), 0) / (Math.min(bars.length, 20) || 1);
  const revenue = fact(input.financials, "Revenues"); const operatingIncome = fact(input.financials, "OperatingIncomeLoss"); const cfo = fact(input.financials, "NetCashProvidedByUsedInOperatingActivities"); const capex = fact(input.financials, "PaymentsToAcquirePropertyPlantAndEquipment");
  const freeCashFlow = cfo[0] !== undefined && capex[0] !== undefined ? cfo[0] - capex[0] : undefined;
  const returns = bars.slice(-64).map((bar, index, source) => index ? bar.close / source[index - 1].close - 1 : undefined).filter((item): item is number => item !== undefined);
  return {
    price,
    dailyChangePercent: ratio(price, input.quote?.previousClose) === undefined ? undefined : (ratio(price, input.quote?.previousClose)! - 1) * 100,
    revenueGrowthYoY: ratio(revenue[0], revenue[1]) === undefined ? undefined : (ratio(revenue[0], revenue[1])! - 1) * 100,
    operatingMargin: ratio(operatingIncome[0], revenue[0]) === undefined ? undefined : ratio(operatingIncome[0], revenue[0])! * 100,
    freeCashFlow,
    freeCashFlowYield: ratio(freeCashFlow, input.marketCapUsdMillions) === undefined ? undefined : ratio(freeCashFlow, input.marketCapUsdMillions)! * 100,
    priceVs20DayHigh: ratio(price, high20) === undefined ? undefined : (ratio(price, high20)! - 1) * 100,
    relativeVolume: ratio(input.quote?.volume, averageVolume20),
    averageDollarVolume20d: bars.length ? bars.slice(-20).reduce((sum, bar) => sum + bar.close * (bar.volume ?? 0), 0) / Math.min(bars.length, 20) / 1_000_000 : undefined,
    return3Months: bars.length >= 64 && latest ? (latest.close / bars[bars.length - 64].close - 1) * 100 : undefined,
    beta: returns.length ? undefined : undefined,
  };
}
