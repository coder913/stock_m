import type { FinancialFact, MarketQuote, PriceBar, StockMetrics } from "../../src/features/market/apiDomain";

export interface MetricInput { quote?: Pick<MarketQuote, "price" | "previousClose" | "volume">; dailyBars?: PriceBar[]; financials?: FinancialFact[]; marketCapUsdMillions?: number; earnings?: { epsActual?: number; epsEstimate?: number }; }
const ratio = (numerator?: number, denominator?: number) => numerator === undefined || !denominator ? undefined : numerator / denominator;
const fact = (facts: FinancialFact[] | undefined, concept: string) => facts?.filter((item) => item.concept === concept).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).map((item) => item.value) ?? [];
const factRecords = (facts: FinancialFact[] | undefined, concept: string) => facts?.filter((item) => item.concept === concept).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)) ?? [];

export function calculateScreenerMetrics(input: MetricInput): Partial<StockMetrics> {
  const price = input.quote?.price;
  const bars = input.dailyBars ?? [];
  const latest = bars.at(-1);
  const high20 = bars.slice(-20).reduce<number | undefined>((max, bar) => max === undefined ? bar.high : Math.max(max, bar.high), undefined);
  const averageVolume20 = bars.slice(-20).reduce((sum, bar) => sum + (bar.volume ?? 0), 0) / (Math.min(bars.length, 20) || 1);
  const revenueRecords = factRecords(input.financials, "Revenues");
  const costRecords = factRecords(input.financials, "CostOfRevenue");
  const revenue = revenueRecords.map((item) => item.value); const operatingIncome = fact(input.financials, "OperatingIncomeLoss"); const cfo = fact(input.financials, "NetCashProvidedByUsedInOperatingActivities"); const capex = fact(input.financials, "PaymentsToAcquirePropertyPlantAndEquipment"); const debt = fact(input.financials, "LongTermDebt"); const cash = fact(input.financials, "CashAndCashEquivalentsAtCarryingValue"); const ebitda = fact(input.financials, "EarningsBeforeInterestTaxesDepreciationAndAmortization");
  const freeCashFlow = cfo[0] !== undefined && capex[0] !== undefined ? cfo[0] - capex[0] : undefined;
  const grossMarginFor = (revenueFact?: FinancialFact) => {
    const costFact = revenueFact && costRecords.find((item) => item.periodEnd === revenueFact.periodEnd && item.unit === revenueFact.unit);
    return revenueFact?.value && costFact ? ((revenueFact.value - costFact.value) / revenueFact.value) * 100 : undefined;
  };
  const currentGrossMargin = grossMarginFor(revenueRecords[0]);
  const priorGrossMargin = grossMarginFor(revenueRecords[1]);
  const returns = bars.slice(-64).map((bar, index, source) => index ? bar.close / source[index - 1].close - 1 : undefined).filter((item): item is number => item !== undefined);
  return {
    price,
    dailyChangePercent: ratio(price, input.quote?.previousClose) === undefined ? undefined : (ratio(price, input.quote?.previousClose)! - 1) * 100,
    revenueGrowthYoY: ratio(revenue[0], revenue[1]) === undefined ? undefined : (ratio(revenue[0], revenue[1])! - 1) * 100,
    grossMargin: currentGrossMargin,
    grossMarginYoYChange: currentGrossMargin !== undefined && priorGrossMargin !== undefined ? currentGrossMargin - priorGrossMargin : undefined,
    operatingMargin: ratio(operatingIncome[0], revenue[0]) === undefined ? undefined : ratio(operatingIncome[0], revenue[0])! * 100,
    freeCashFlow,
    freeCashFlowYield: ratio(freeCashFlow, input.marketCapUsdMillions) === undefined ? undefined : ratio(freeCashFlow, input.marketCapUsdMillions)! * 100,
    netDebtToEbitda: ebitda[0] ? ((debt[0] ?? 0) - (cash[0] ?? 0)) / ebitda[0] : undefined,
    earningsSurprise: input.earnings?.epsActual !== undefined && input.earnings.epsEstimate ? ((input.earnings.epsActual - input.earnings.epsEstimate) / Math.abs(input.earnings.epsEstimate)) * 100 : undefined,
    priceVs20DayHigh: ratio(price, high20) === undefined ? undefined : (ratio(price, high20)! - 1) * 100,
    relativeVolume: ratio(input.quote?.volume, averageVolume20),
    averageDollarVolume20d: bars.length ? bars.slice(-20).reduce((sum, bar) => sum + bar.close * (bar.volume ?? 0), 0) / Math.min(bars.length, 20) / 1_000_000 : undefined,
    return3Months: bars.length >= 64 && latest ? (latest.close / bars[bars.length - 64].close - 1) * 100 : undefined,
    beta: returns.length ? undefined : undefined,
  };
}
