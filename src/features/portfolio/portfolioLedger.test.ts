import { beforeEach, expect, test } from "vitest";
import { PortfolioLedger } from "./portfolioLedger";

beforeEach(() => localStorage.clear());

test("appends immutable buy, sell, dividend, and fee events", () => {
  const ledger = new PortfolioLedger(localStorage);
  const buy = ledger.append({ type: "buy", symbol: "NVDA", occurredAt: "2026-08-03T15:00:00Z", quantity: 10, price: 100, thesisVersionId: "thesis-v1" });
  ledger.append({ type: "sell", symbol: "NVDA", occurredAt: "2026-08-04T15:00:00Z", quantity: 2, price: 120, reason: "降低集中度" });
  ledger.append({ type: "dividend", symbol: "NVDA", occurredAt: "2026-08-05T15:00:00Z", amount: 5, reason: "现金分红" });
  ledger.append({ type: "fee", occurredAt: "2026-08-05T15:01:00Z", amount: 1, reason: "模拟费用" });

  expect(ledger.list()).toHaveLength(4);
  expect(Object.isFrozen(buy)).toBe(true);
});

test("rejects a sell larger than the available quantity", () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", occurredAt: "2026-08-03T15:00:00Z", quantity: 3, price: 100, thesisVersionId: "thesis-v1" });
  expect(() => ledger.append({ type: "sell", symbol: "NVDA", occurredAt: "2026-08-04T15:00:00Z", quantity: 4, price: 120, reason: "清仓" })).toThrow("可卖数量为 3");
});

test("migrates legacy orders exactly once", () => {
  localStorage.setItem("stock_m:orders", JSON.stringify([{ symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "thesis-v1" }]));
  const ledger = new PortfolioLedger(localStorage);
  expect(ledger.migrateLegacyOrders()).toEqual({ migrated: 1, skipped: false });
  expect(ledger.migrateLegacyOrders()).toEqual({ migrated: 0, skipped: true });
  expect(ledger.list()).toHaveLength(1);
});

test("records deposits and prevents an over-withdrawal", () => {
  const ledger = new PortfolioLedger(localStorage, () => 1000);
  ledger.append({ type: "deposit", amount: 500, reason: "追加资金", occurredAt: "2026-08-04T14:00:00Z" });
  ledger.append({ type: "withdrawal", amount: 1200, reason: "提取资金", occurredAt: "2026-08-05T14:00:00Z" });

  expect(() => ledger.append({
    type: "withdrawal",
    amount: 301,
    reason: "过量",
    occurredAt: "2026-08-06T14:00:00Z",
  })).toThrow("可用现金为 300");
});

test("applies and deduplicates an immutable split", () => {
  const ledger = new PortfolioLedger(localStorage, () => 10_000);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" });
  const split = {
    type: "split",
    symbol: "NVDA",
    oldRate: 1,
    newRate: 2,
    quantityMultiplier: 2,
    source: "alpaca",
    sourceEventId: "alpaca:action:nvda-split",
    confirmedAt: "2026-08-06T12:00:00Z",
    occurredAt: "2026-08-06T00:00:00Z",
  } as const;

  const first = ledger.append(split);
  const second = ledger.append(split);

  expect(ledger.availableQuantity("NVDA")).toBe(20);
  expect(second.id).toBe(first.id);
  expect(ledger.list()).toHaveLength(2);
  expect(Object.isFrozen(first)).toBe(true);
});

test("applies a same-day split before a later buy", () => {
  const ledger = new PortfolioLedger(localStorage);
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-05T15:00:00Z" });
  ledger.append({ type: "buy", symbol: "NVDA", quantity: 5, price: 55, thesisVersionId: "t2", occurredAt: "2026-08-06T14:00:00Z" });
  ledger.append({ type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 2, source: "manual", sourceEventId: "manual:split-1", confirmedAt: "2026-08-06T16:00:00Z", occurredAt: "2026-08-06T00:00:00Z" });

  expect(ledger.availableQuantity("NVDA")).toBe(25);
});

test("rejects inconsistent split ratios", () => {
  const ledger = new PortfolioLedger(localStorage);
  expect(() => ledger.append({ type: "split", symbol: "NVDA", oldRate: 1, newRate: 2, quantityMultiplier: 3, source: "manual", sourceEventId: "manual:bad", confirmedAt: "2026-08-06T16:00:00Z", occurredAt: "2026-08-06T00:00:00Z" })).toThrow("拆股比例");
});
