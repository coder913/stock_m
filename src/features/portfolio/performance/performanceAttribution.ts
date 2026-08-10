import type { AttributionResult, ContributionItem, PerformanceResult } from "./domain";

const dailyTolerance = 1e-10;
const linkedTolerance = 1e-8;
const moneyTolerance = 0.01;

interface WorkingContribution {
  key: string;
  symbol?: string;
  label: string;
  moneyContribution: number;
  dailyContributions: number[];
  realizedPnl: number;
  dividends: number;
  fees: number;
}

const failed = (totalMoneyPnl: number, diagnostic: AttributionResult["diagnostic"]): AttributionResult => ({
  items: [],
  totalMoneyPnl,
  reconciled: false,
  diagnostic,
});

export function calculateAttribution(performance: PerformanceResult): AttributionResult {
  const days = performance.dailyInternals;
  const totalMoneyPnl = performance.interval.endingValue
    - performance.interval.beginningValue
    - performance.interval.deposits
    + performance.interval.withdrawals;
  if (!days.length) return failed(totalMoneyPnl, "DAILY_RECONCILIATION_FAILED");
  const items = new Map<string, WorkingContribution>();
  const ensure = (key: string, symbol?: string) => {
    const existing = items.get(key) ?? {
      key,
      symbol,
      label: symbol ?? "费用",
      moneyContribution: 0,
      dailyContributions: Array(days.length).fill(0),
      realizedPnl: 0,
      dividends: 0,
      fees: 0,
    };
    items.set(key, existing);
    return existing;
  };

  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex];
    if (day.dailyReturn === undefined || day.modifiedDietzDenominator === undefined || day.modifiedDietzDenominator <= 0 || day.endingValue === undefined) {
      return failed(totalMoneyPnl, "DAILY_RECONCILIATION_FAILED");
    }
    let dailyContributionTotal = 0;
    for (const [symbol, position] of Object.entries(day.positions)) {
      if (position.endingMarketValue === undefined) return failed(totalMoneyPnl, "DAILY_RECONCILIATION_FAILED");
      const economicPnl = position.endingMarketValue
        - position.beginningMarketValue
        - position.buyCashPaid
        + position.sellCashReceived;
      const moneyContribution = economicPnl + position.dividends;
      const contribution = moneyContribution / day.modifiedDietzDenominator;
      const item = ensure(`symbol:${symbol}`, symbol);
      item.moneyContribution += moneyContribution;
      item.dailyContributions[dayIndex] += contribution;
      item.realizedPnl += position.realizedPnlChange;
      item.dividends += position.dividends;
      dailyContributionTotal += contribution;
    }
    if (day.fees) {
      const contribution = -day.fees / day.modifiedDietzDenominator;
      const item = ensure("fees");
      item.moneyContribution -= day.fees;
      item.dailyContributions[dayIndex] += contribution;
      item.fees += day.fees;
      dailyContributionTotal += contribution;
    }
    if (Math.abs(dailyContributionTotal - day.dailyReturn) > dailyTolerance) {
      return failed(totalMoneyPnl, "DAILY_RECONCILIATION_FAILED");
    }
  }

  const returns = days.map((day) => day.dailyReturn!);
  const resultItems: ContributionItem[] = [...items.values()].map((item) => {
    const returnContribution = item.dailyContributions.reduce((total, contribution, dayIndex) => {
      const futureGrowth = returns.slice(dayIndex + 1).reduce((growth, dailyReturn) => growth * (1 + dailyReturn), 1);
      return total + contribution * futureGrowth;
    }, 0);
    return {
      key: item.key,
      symbol: item.symbol,
      label: item.label,
      moneyContribution: item.moneyContribution,
      returnContribution,
      realizedPnl: item.realizedPnl,
      unrealizedPnl: item.moneyContribution - item.realizedPnl - item.dividends,
      dividends: item.dividends,
      fees: item.fees,
    };
  });
  const totalReturnContribution = resultItems.reduce((sum, item) => sum + (item.returnContribution ?? 0), 0);
  if (performance.summary.twr === undefined || Math.abs(totalReturnContribution - performance.summary.twr) > linkedTolerance) {
    return failed(totalMoneyPnl, "RETURN_RECONCILIATION_FAILED");
  }
  const attributedMoney = resultItems.reduce((sum, item) => sum + item.moneyContribution, 0);
  if (Math.abs(attributedMoney - totalMoneyPnl) > moneyTolerance) {
    return failed(totalMoneyPnl, "MONEY_RECONCILIATION_FAILED");
  }
  resultItems.sort((left, right) => (right.returnContribution ?? 0) - (left.returnContribution ?? 0));
  return { items: resultItems, totalMoneyPnl, totalReturnContribution, reconciled: true };
}
