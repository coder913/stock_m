import { expect, test } from "vitest";
import type { PaperLedgerEventView } from "../../trading/paperPortfolioApiClient";
import { adaptBrokerPerformance } from "./brokerPerformanceAdapter";

const broker = (overrides: Partial<PaperLedgerEventView> = {}): PaperLedgerEventView => ({
  id: "event-1",
  remoteSourceId: "activity:1",
  source: "alpaca-paper",
  eventType: "deposit",
  amount: "1000.00000000",
  occurredAt: "2026-08-04T13:00:00Z",
  provenanceJson: {},
  ...overrides,
});

test("maps broker Decimal events into sorted performance events with normalized cash signs", () => {
  const result = adaptBrokerPerformance({
    activeDrift: false,
    events: [
      broker({ id: "fee", remoteSourceId: "activity:3", eventType: "fee", amount: "-1.25000000", occurredAt: "2026-08-04T15:00:00Z" }),
      broker({ id: "deposit", remoteSourceId: "activity:1" }),
      broker({ id: "buy", remoteSourceId: "activity:2", eventType: "buy", symbol: "nvda", quantity: "2.00000000", price: "100.12500000", amount: "-200.25000000", occurredAt: "2026-08-04T14:00:00Z" }),
    ],
  });

  expect(result.dataState).toBe("fresh");
  expect(result.inceptionDate).toBe("2026-08-04");
  expect(result.cashHistoryComplete).toBe(true);
  expect(result.events).toEqual([
    { id: "deposit", type: "deposit", amount: 1000, occurredAt: "2026-08-04T13:00:00Z", source: "alpaca", sourceEventId: "activity:1" },
    { id: "buy", type: "buy", symbol: "NVDA", quantity: 2, price: 100.125, occurredAt: "2026-08-04T14:00:00Z", source: "alpaca", sourceEventId: "activity:2" },
    { id: "fee", type: "fee", amount: 1.25, occurredAt: "2026-08-04T15:00:00Z", source: "alpaca", sourceEventId: "activity:3" },
  ]);
});

test("blocks all performance events while broker reconciliation drift is active", () => {
  expect(adaptBrokerPerformance({ activeDrift: true, events: [broker()] })).toMatchObject({
    dataState: "unavailable",
    events: [],
    notices: ["Paper 对账不一致"],
  });
});

test("filters unknown activities with a visible notice", () => {
  const result = adaptBrokerPerformance({ activeDrift: false, events: [broker({ eventType: "unknown" })] });

  expect(result.events).toEqual([]);
  expect(result.notices).toEqual(["已忽略 1 条无法识别的 Paper 活动"]);
});

test("rejects malformed Decimal fields with the broker event id", () => {
  expect(() => adaptBrokerPerformance({ activeDrift: false, events: [broker({ id: "bad-event", amount: "1e3" })] })).toThrow("PAPER_LEDGER_DECIMAL_INVALID:bad-event:amount");
});

test("marks cash history incomplete when a trade predates every deposit", () => {
  const result = adaptBrokerPerformance({
    activeDrift: false,
    events: [broker({ id: "buy", eventType: "buy", symbol: "NVDA", quantity: "1", price: "10", amount: "-10" })],
  });

  expect(result.cashHistoryComplete).toBe(false);
});

test("never accepts non-Paper sources", () => {
  expect(() => adaptBrokerPerformance({ activeDrift: false, events: [broker({ source: "manual" as never })] })).toThrow("PAPER_LEDGER_SOURCE_REQUIRED");
});
