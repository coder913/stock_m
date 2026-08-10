import type { LedgerEvent, PortfolioAnalyticsInput, PortfolioAnalyticsResult, PositionSnapshot } from "./domain";
import { sortLedgerEvents } from "./portfolioLedger";

interface WorkingPosition { symbol: string; quantity: number; cost: number; realizedPnl: number; }

export function calculateDrawdown(values: number[]): { current: number; maximum: number } {
  if (values.length < 2) return { current: 0, maximum: 0 };
  let peak = values[0]; let maximum = 0;
  for (const value of values) { peak = Math.max(peak, value); if (peak > 0) maximum = Math.max(maximum, ((peak - value) / peak) * 100); }
  return { current: peak > 0 ? ((peak - values.at(-1)! ) / peak) * 100 : 0, maximum };
}

export function calculatePortfolio(input: PortfolioAnalyticsInput): PortfolioAnalyticsResult {
  const positions = new Map<string, WorkingPosition>(); let cash = input.initialCash; let dividends = 0; let fees = 0;
  for (const event of sortLedgerEvents(input.events)) {
    if (event.type === "split" && event.symbol) { const item = positions.get(event.symbol); if (item) item.quantity = Math.round((item.quantity * event.quantityMultiplier! + Number.EPSILON) * 1e8) / 1e8; }
    if (event.type === "buy" && event.symbol) { const item = positions.get(event.symbol) ?? { symbol: event.symbol, quantity: 0, cost: 0, realizedPnl: 0 }; item.quantity += event.quantity!; item.cost += event.quantity! * event.price!; positions.set(item.symbol, item); cash -= event.quantity! * event.price!; }
    if (event.type === "sell" && event.symbol) { const item = positions.get(event.symbol) ?? { symbol: event.symbol, quantity: 0, cost: 0, realizedPnl: 0 }; const average = item.quantity ? item.cost / item.quantity : 0; item.realizedPnl += (event.price! - average) * event.quantity!; item.quantity -= event.quantity!; item.cost -= average * event.quantity!; positions.set(item.symbol, item); cash += event.quantity! * event.price!; }
    if (event.type === "dividend") { cash += event.amount!; dividends += event.amount!; }
    if (event.type === "fee") { cash -= event.amount!; fees += event.amount!; }
    if (event.type === "deposit") cash += event.amount!;
    if (event.type === "withdrawal") cash -= event.amount!;
  }
  const raw = [...positions.values()].filter((item) => item.quantity > 0);
  const missingPrice = raw.some((item) => !input.quotes[item.symbol]);
  const marketTotal = missingPrice ? undefined : raw.reduce((total, item) => total + item.quantity * input.quotes[item.symbol].price, 0);
  const view: PositionSnapshot[] = raw.map((item) => { const quote = input.quotes[item.symbol]; const marketValue = quote ? item.quantity * quote.price : undefined; return { symbol: item.symbol, quantity: item.quantity, averageCost: item.cost / item.quantity, marketPrice: quote?.price, marketValue, realizedPnl: item.realizedPnl, unrealizedPnl: marketValue === undefined ? undefined : marketValue - item.cost, weight: marketTotal ? (marketValue! / marketTotal) * 100 : undefined, sector: input.sectors[item.symbol] ?? "未分类" }; });
  const realized = raw.reduce((total, item) => total + item.realizedPnl, 0);
  const unrealized = view.reduce((total, item) => total + (item.unrealizedPnl ?? 0), 0);
  const sectorExposure: Record<string, number> = {};
  if (marketTotal) for (const item of view) sectorExposure[item.sector] = (sectorExposure[item.sector] ?? 0) + ((item.marketValue! / marketTotal) * 100);
  return { positions: view, cash, totalValue: missingPrice ? undefined : cash + marketTotal!, cumulativePnl: missingPrice ? undefined : realized + unrealized + dividends - fees, sectorExposure, topFiveConcentration: marketTotal ? view.sort((a,b) => b.marketValue! - a.marketValue!).slice(0, 5).reduce((total, item) => total + item.marketValue!, 0) / marketTotal * 100 : undefined, drawdown: calculateDrawdown(input.history) };
}
