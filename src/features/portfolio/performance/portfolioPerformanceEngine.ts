import type { LedgerEvent } from "../domain";
import { sortLedgerEvents } from "../portfolioLedger";
import { toNewYorkMarketDate } from "../portfolioSettingsRepository";
import type {
  DailyPerformanceInternal,
  DailyPortfolioPoint,
  DailyPositionInternal,
  PerformanceInput,
  PerformanceResult,
  PerformanceResourceState,
} from "./domain";
import { solveXirr, type XirrCashFlow } from "./xirr";

interface WorkingPosition { quantity: number; cost: number; realizedPnl: number; }
const round8 = (value: number): number => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
const marketDateOfEvent = (event: LedgerEvent): string => event.type === "split" ? event.occurredAt.slice(0, 10) : toNewYorkMarketDate(event.occurredAt);
const productReturn = (returns: number[]): number => returns.reduce((value, daily) => value * (1 + daily), 1) - 1;

export function calculatePerformance(input: PerformanceInput): PerformanceResult {
  const { history } = input;
  const holdingMaps = Object.fromEntries(Object.entries(history.holdingBars).map(([symbol, bars]) => [symbol, new Map(bars.map((bar) => [toNewYorkMarketDate(bar.startedAt), bar]))]));
  const benchmarkMap = new Map(history.benchmarkBars.map((bar) => [toNewYorkMarketDate(bar.startedAt), bar]));
  const valuationDates = [...new Set([
    ...Object.values(history.holdingBars).flatMap((bars) => bars.map((bar) => toNewYorkMarketDate(bar.startedAt))),
    ...history.benchmarkBars.map((bar) => toNewYorkMarketDate(bar.startedAt)),
  ])].filter((date) => date <= input.to).sort();
  const eventsByDate = new Map<string, LedgerEvent[]>();
  const mappedValuationDates = new Map<string, string>();
  for (const ledgerEvent of sortLedgerEvents(history.events)) {
    const sourceDate = marketDateOfEvent(ledgerEvent);
    const valuationDate = valuationDates.find((date) => date >= sourceDate);
    if (valuationDate) {
      eventsByDate.set(valuationDate, [...(eventsByDate.get(valuationDate) ?? []), ledgerEvent]);
      mappedValuationDates.set(ledgerEvent.id, valuationDate);
    }
  }

  const positions = new Map<string, WorkingPosition>();
  const lastPrices = new Map<string, number>();
  const carryCounts = new Map<string, number>();
  const points: DailyPortfolioPoint[] = [];
  const dailyInternals: DailyPerformanceInternal[] = [];
  const warnings = [...history.notices];
  let cash = history.settings.initialCash;
  let previousTotal: number | undefined;
  let previousValuedAt: string | undefined;
  let everValued = false;
  let segmentReturns: number[] = [];
  let segmentStart: string | undefined;
  let segmentPeak: number | undefined;
  let segmentMaximumDrawdown = 0;
  let benchmarkBase: number | undefined;
  let previousBenchmarkClose: number | undefined;
  let selectedRangeEntered = false;

  for (const marketDate of valuationDates) {
    const allBars = [
      ...Object.values(history.holdingBars).flatMap((bars) => bars.filter((bar) => toNewYorkMarketDate(bar.startedAt) === marketDate)),
      ...history.benchmarkBars.filter((bar) => toNewYorkMarketDate(bar.startedAt) === marketDate),
    ];
    const valuedAt = allBars.map((bar) => bar.startedAt).sort().at(-1) ?? `${marketDate}T20:00:00Z`;
    const periodStartedAt = previousValuedAt ?? `${history.settings.inceptionDate}T00:00:00Z`;
    const beginningValue = previousTotal ?? (!everValued ? history.settings.initialCash : undefined);
    const beginningValues = new Map<string, number>();
    for (const [symbol, position] of positions) beginningValues.set(symbol, position.quantity * (lastPrices.get(symbol) ?? 0));
    let deposits = 0;
    let withdrawals = 0;
    let fees = 0;
    const positionActivity = new Map<string, { buyCashPaid: number; sellCashReceived: number; realizedPnlChange: number; dividends: number }>();
    const activityFor = (symbol: string) => {
      const current = positionActivity.get(symbol) ?? { buyCashPaid: 0, sellCashReceived: 0, realizedPnlChange: 0, dividends: 0 };
      positionActivity.set(symbol, current);
      return current;
    };
    const sameDayBuyPrice = new Map<string, number>();
    for (const ledgerEvent of eventsByDate.get(marketDate) ?? []) {
      if (ledgerEvent.type === "split" && ledgerEvent.symbol) {
        const position = positions.get(ledgerEvent.symbol);
        if (position) position.quantity = round8(position.quantity * (ledgerEvent.quantityMultiplier ?? 1));
      }
      if (ledgerEvent.type === "deposit") { deposits += ledgerEvent.amount ?? 0; cash += ledgerEvent.amount ?? 0; }
      if (ledgerEvent.type === "withdrawal") { withdrawals += ledgerEvent.amount ?? 0; cash -= ledgerEvent.amount ?? 0; }
      if (ledgerEvent.type === "buy" && ledgerEvent.symbol) {
        const position = positions.get(ledgerEvent.symbol) ?? { quantity: 0, cost: 0, realizedPnl: 0 };
        const paid = (ledgerEvent.quantity ?? 0) * (ledgerEvent.price ?? 0);
        position.quantity = round8(position.quantity + (ledgerEvent.quantity ?? 0));
        position.cost += paid;
        positions.set(ledgerEvent.symbol, position);
        cash -= paid;
        activityFor(ledgerEvent.symbol).buyCashPaid += paid;
        sameDayBuyPrice.set(ledgerEvent.symbol, ledgerEvent.price ?? 0);
      }
      if (ledgerEvent.type === "sell" && ledgerEvent.symbol) {
        const position = positions.get(ledgerEvent.symbol) ?? { quantity: 0, cost: 0, realizedPnl: 0 };
        const averageCost = position.quantity ? position.cost / position.quantity : 0;
        const received = (ledgerEvent.quantity ?? 0) * (ledgerEvent.price ?? 0);
        const realized = ((ledgerEvent.price ?? 0) - averageCost) * (ledgerEvent.quantity ?? 0);
        position.quantity = round8(position.quantity - (ledgerEvent.quantity ?? 0));
        position.cost -= averageCost * (ledgerEvent.quantity ?? 0);
        position.realizedPnl += realized;
        positions.set(ledgerEvent.symbol, position);
        cash += received;
        const activity = activityFor(ledgerEvent.symbol);
        activity.sellCashReceived += received;
        activity.realizedPnlChange += realized;
      }
      if (ledgerEvent.type === "dividend" && ledgerEvent.symbol) { cash += ledgerEvent.amount ?? 0; activityFor(ledgerEvent.symbol).dividends += ledgerEvent.amount ?? 0; }
      if (ledgerEvent.type === "fee") { cash -= ledgerEvent.amount ?? 0; fees += ledgerEvent.amount ?? 0; }
    }

    const missingSymbols: string[] = [];
    let holdingsValue = 0;
    let usedCarriedPrice = false;
    const positionInternals: Record<string, DailyPositionInternal> = {};
    for (const [symbol, position] of positions) {
      const exactBar = holdingMaps[symbol]?.get(marketDate);
      let close: number | undefined;
      if (exactBar) {
        close = exactBar.close;
        lastPrices.set(symbol, close);
        carryCounts.set(symbol, 0);
      } else if (position.quantity > 0 && sameDayBuyPrice.has(symbol) && !lastPrices.has(symbol)) {
        close = sameDayBuyPrice.get(symbol);
        lastPrices.set(symbol, close!);
        carryCounts.set(symbol, 0);
        usedCarriedPrice = true;
      } else if (position.quantity > 0 && lastPrices.has(symbol) && (carryCounts.get(symbol) ?? 0) < 5) {
        close = lastPrices.get(symbol);
        carryCounts.set(symbol, (carryCounts.get(symbol) ?? 0) + 1);
        usedCarriedPrice = true;
      }
      if (position.quantity > 0 && close === undefined) missingSymbols.push(symbol);
      const endingMarketValue = position.quantity > 0 && close !== undefined ? position.quantity * close : position.quantity === 0 ? 0 : undefined;
      if (endingMarketValue !== undefined) holdingsValue += endingMarketValue;
      const activity = positionActivity.get(symbol) ?? { buyCashPaid: 0, sellCashReceived: 0, realizedPnlChange: 0, dividends: 0 };
      positionInternals[symbol] = {
        quantity: position.quantity,
        cost: position.cost,
        realizedPnl: position.realizedPnl,
        beginningMarketValue: beginningValues.get(symbol) ?? 0,
        endingMarketValue,
        ...activity,
      };
    }

    const pendingSplit = history.pendingSplits.find((candidate) => (candidate.split?.effectiveDate ?? candidate.scheduledAt.slice(0, 10)) <= marketDate);
    const blocked = history.dataState === "unavailable" || Boolean(pendingSplit);
    if (pendingSplit && !warnings.includes("未确认拆股会阻断生效日后的绩效")) warnings.push("未确认拆股会阻断生效日后的绩效");
    const unavailable = blocked || missingSymbols.length > 0;
    const totalValue = unavailable ? undefined : cash + holdingsValue;
    const externalFlow = deposits - withdrawals;
    let denominator: number | undefined;
    let dailyReturn: number | undefined;
    if (beginningValue !== undefined && totalValue !== undefined) {
      const periodStart = new Date(periodStartedAt).getTime();
      const periodEnd = new Date(valuedAt).getTime();
      const flowEvents = (eventsByDate.get(marketDate) ?? []).filter((event) => event.type === "deposit" || event.type === "withdrawal");
      const weightedFlows = flowEvents.reduce((sum, flow) => {
        const signed = flow.type === "deposit" ? flow.amount ?? 0 : -(flow.amount ?? 0);
        const eventTime = new Date(flow.occurredAt).getTime();
        const weight = periodEnd > periodStart ? Math.max(0, Math.min(1, (periodEnd - eventTime) / (periodEnd - periodStart))) : 0;
        return sum + weight * signed;
      }, 0);
      denominator = beginningValue + weightedFlows;
      if (denominator > 0) dailyReturn = (totalValue - beginningValue - externalFlow) / denominator;
    }
    const baseState: PerformanceResourceState = unavailable ? "unavailable" : usedCarriedPrice || history.dataState === "stale" ? "stale" : "fresh";

    let cumulativeTwr: number | undefined;
    let normalizedPortfolio: number | undefined;
    let benchmarkValue: number | undefined;
    let benchmarkReturn: number | undefined;
    let drawdown: number | undefined;
    const benchmarkClose = benchmarkMap.get(marketDate)?.close;
    if (marketDate >= input.from && !selectedRangeEntered) {
      selectedRangeEntered = true;
      segmentReturns = [];
      segmentStart = undefined;
      segmentPeak = undefined;
      segmentMaximumDrawdown = 0;
      benchmarkBase = previousBenchmarkClose ?? benchmarkClose;
    }
    if (totalValue === undefined) {
      previousTotal = undefined;
      previousValuedAt = undefined;
      segmentReturns = [];
      segmentStart = undefined;
      segmentPeak = undefined;
      segmentMaximumDrawdown = 0;
      benchmarkBase = undefined;
    } else {
      if (!segmentStart) {
        segmentStart = marketDate;
        segmentReturns = [];
        segmentPeak = undefined;
        segmentMaximumDrawdown = 0;
        benchmarkBase ??= previousBenchmarkClose ?? benchmarkClose;
      }
      if (dailyReturn !== undefined) segmentReturns.push(dailyReturn);
      cumulativeTwr = productReturn(segmentReturns);
      normalizedPortfolio = 100 * (1 + cumulativeTwr);
      if (benchmarkClose !== undefined && benchmarkBase !== undefined && benchmarkBase > 0) {
        benchmarkValue = (benchmarkClose / benchmarkBase) * 100;
        benchmarkReturn = benchmarkClose / benchmarkBase - 1;
      }
      segmentPeak = Math.max(segmentPeak ?? normalizedPortfolio, normalizedPortfolio);
      drawdown = segmentPeak > 0 ? (segmentPeak - normalizedPortfolio) / segmentPeak : 0;
      segmentMaximumDrawdown = Math.max(segmentMaximumDrawdown, drawdown);
      previousTotal = totalValue;
      previousValuedAt = valuedAt;
      everValued = true;
    }

    if (marketDate >= input.from) {
      points.push({ marketDate, valuedAt, cash, holdingsValue: unavailable ? undefined : holdingsValue, totalValue, externalFlow, dailyReturn, cumulativeTwr, normalizedPortfolio, benchmarkValue, benchmarkReturn, excessReturn: cumulativeTwr !== undefined && benchmarkReturn !== undefined ? cumulativeTwr - benchmarkReturn : undefined, drawdown, dataState: baseState, missingSymbols: missingSymbols.sort() });
      dailyInternals.push({ marketDate, valuedAt, periodStartedAt, beginningValue, endingValue: totalValue, deposits, withdrawals, externalFlow, fees, modifiedDietzDenominator: denominator, dailyReturn, positions: positionInternals, dataState: baseState });
    }
    if (benchmarkClose !== undefined) previousBenchmarkClose = benchmarkClose;
  }

  const lastAvailableIndex = points.map((point) => point.totalValue !== undefined).lastIndexOf(true);
  let segmentFirstIndex = lastAvailableIndex;
  while (segmentFirstIndex > 0 && points[segmentFirstIndex - 1].totalValue !== undefined) segmentFirstIndex -= 1;
  const segmentPoints = lastAvailableIndex >= 0 ? points.slice(segmentFirstIndex, lastAvailableIndex + 1) : [];
  const segmentInternals = lastAvailableIndex >= 0 ? dailyInternals.slice(segmentFirstIndex, lastAvailableIndex + 1) : [];
  const firstInternal = segmentInternals[0];
  const lastInternal = segmentInternals.at(-1);
  const beginningValue = firstInternal?.beginningValue ?? firstInternal?.endingValue ?? 0;
  const endingValue = lastInternal?.endingValue ?? 0;
  const deposits = segmentInternals.reduce((sum, day, index) => sum + (index === 0 && firstInternal.beginningValue === undefined ? 0 : day.deposits), 0);
  const withdrawals = segmentInternals.reduce((sum, day, index) => sum + (index === 0 && firstInternal.beginningValue === undefined ? 0 : day.withdrawals), 0);
  const twr = segmentPoints.at(-1)?.cumulativeTwr;
  const xirrFlows: XirrCashFlow[] = [];
  if (segmentPoints.length) {
    xirrFlows.push({ at: firstInternal.beginningValue !== undefined ? firstInternal.periodStartedAt : segmentPoints[0].valuedAt, amount: -beginningValue });
    for (const ledgerEvent of history.events) {
      const valuationDate = mappedValuationDates.get(ledgerEvent.id);
      if (!valuationDate || valuationDate < segmentPoints[0].marketDate || valuationDate > segmentPoints.at(-1)!.marketDate) continue;
      if (ledgerEvent.type === "deposit") xirrFlows.push({ at: ledgerEvent.occurredAt, amount: -(ledgerEvent.amount ?? 0) });
      if (ledgerEvent.type === "withdrawal") xirrFlows.push({ at: ledgerEvent.occurredAt, amount: ledgerEvent.amount ?? 0 });
    }
    xirrFlows.push({ at: segmentPoints.at(-1)!.valuedAt, amount: endingValue });
  }
  const naturalDays = segmentPoints.length ? (new Date(`${segmentPoints.at(-1)!.marketDate}T00:00:00Z`).getTime() - new Date(`${segmentPoints[0].marketDate}T00:00:00Z`).getTime()) / 86_400_000 : 0;
  const nonZeroReturns = segmentPoints.flatMap((point) => point.dailyReturn !== undefined && Math.abs(point.dailyReturn) > 1e-15 ? [point.dailyReturn] : []);
  const benchmarkReturn = segmentPoints.at(-1)?.benchmarkReturn;
  const summary = {
    from: input.from,
    to: input.to,
    availableFrom: segmentPoints[0]?.marketDate,
    twr,
    mwr: solveXirr(xirrFlows),
    annualizedReturn: twr !== undefined && naturalDays >= 30 && 1 + twr > 0 ? (1 + twr) ** (365.2425 / naturalDays) - 1 : undefined,
    benchmarkReturn,
    excessReturn: twr !== undefined && benchmarkReturn !== undefined ? twr - benchmarkReturn : undefined,
    currentDrawdown: segmentPoints.at(-1)?.drawdown,
    maximumDrawdown: segmentPoints.length ? Math.max(...segmentPoints.map((point) => point.drawdown ?? 0)) : undefined,
    positiveDayRate: nonZeroReturns.length ? nonZeroReturns.filter((value) => value > 0).length / nonZeroReturns.length : undefined,
  };
  if (points.some((point) => point.dataState === "unavailable")) warnings.push("行情区间不连续");
  return { points, summary, dailyInternals, interval: { beginningValue, endingValue, deposits, withdrawals }, warnings: [...new Set(warnings)] };
}
