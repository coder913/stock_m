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
