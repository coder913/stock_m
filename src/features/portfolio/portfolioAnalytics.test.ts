import { expect, test } from "vitest";
import { calculatePortfolio } from "./portfolioAnalytics";
import type { LedgerEvent } from "./domain";

let sequence = 0;
const event = (input: Omit<LedgerEvent, "id" | "occurredAt">): LedgerEvent => {
  sequence += 1;
  return { id: `event-${sequence}`, occurredAt: `2026-08-${String(sequence).padStart(2, "0")}T15:00:00Z`, ...input };
};
const buy = (symbol: string, quantity: number, price: number) => event({ type: "buy", symbol, quantity, price, thesisVersionId: "v1" });
const sell = (symbol: string, quantity: number, price: number) => event({ type: "sell", symbol, quantity, price, reason: "调整" });
const dividend = (symbol: string, amount: number) => event({ type: "dividend", symbol, amount, reason: "分红" });
const fee = (amount: number) => event({ type: "fee", amount, reason: "费用" });

test("calculates weighted cost, partial-sale P&L, dividends, and fees", () => {
  const result = calculatePortfolio({ events: [buy("NVDA", 10, 100), buy("NVDA", 10, 120), sell("NVDA", 5, 150), dividend("NVDA", 20), fee(5)], initialCash: 10_000, quotes: { NVDA: { price: 140, previousClose: 135 } }, sectors: { NVDA: "半导体" }, history: [10_000, 10_500, 10_200] });
  expect(result.positions[0]).toMatchObject({ symbol: "NVDA", quantity: 15, averageCost: 110, realizedPnl: 200, unrealizedPnl: 450 });
  expect(result.cash).toBe(8565);
  expect(result.cumulativePnl).toBe(665);
});

test("preserves a position but marks valuation unavailable when price is missing", () => {
  const result = calculatePortfolio({ events: [buy("NVDA", 10, 100)], initialCash: 10_000, quotes: {}, sectors: { NVDA: "半导体" }, history: [] });
  expect(result.positions[0]).toMatchObject({ quantity: 10, marketValue: undefined, weight: undefined });
  expect(result.totalValue).toBeUndefined();
});

test("calculates sector exposure, top-five concentration, and drawdown", () => {
  const result = calculatePortfolio({ events: [buy("NVDA", 4, 100), buy("MSFT", 6, 100)], initialCash: 1000, quotes: { NVDA: { price: 100, previousClose: 100 }, MSFT: { price: 100, previousClose: 100 } }, sectors: { NVDA: "半导体", MSFT: "软件" }, history: [100, 125, 100, 112.5] });
  expect(result.sectorExposure["半导体"]).toBeCloseTo(40);
  expect(result.topFiveConcentration).toBeCloseTo(100);
  expect(result.drawdown).toEqual({ current: 10, maximum: 20 });
});

test("changes cash but excludes deposits and withdrawals from P&L", () => {
  const result = calculatePortfolio({
    events: [
      event({ type: "deposit", amount: 500, reason: "追加资金" }),
      buy("NVDA", 10, 100),
      event({ type: "withdrawal", amount: 200, reason: "提取资金" }),
    ],
    initialCash: 1000,
    quotes: { NVDA: { price: 110, previousClose: 105 } },
    sectors: { NVDA: "半导体" },
    history: [],
  });

  expect(result.cash).toBe(300);
  expect(result.totalValue).toBe(1400);
  expect(result.cumulativePnl).toBe(100);
});

test("changes quantity and per-share cost without changing total cost on split", () => {
  const result = calculatePortfolio({
    events: [
      buy("NVDA", 10, 100),
      event({ type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "alpaca", sourceEventId: "alpaca:action:nvda-split", confirmedAt: "2026-08-06T12:00:00Z" }),
    ],
    initialCash: 1000,
    quotes: { NVDA: { price: 50, previousClose: 50 } },
    sectors: { NVDA: "半导体" },
    history: [],
  });

  expect(result.positions[0]).toMatchObject({ quantity: 20, averageCost: 50, unrealizedPnl: 0 });
  expect(result.totalValue).toBe(1000);
  expect(result.cumulativePnl).toBe(0);
});
