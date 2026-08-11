import { expect, test } from "vitest";
import { mapBrokerActivity } from "./brokerActivityMapper";

const base = { occurredAt: "2026-08-11T00:00:00Z", raw: {} };

test("maps dividends, fees, and splits without losing provenance", () => {
  expect(mapBrokerActivity({ remoteActivityId: "d1", type: "DIV", amount: "12.34", symbol: "AAPL", ...base }))
    .toMatchObject({ eventType: "dividend", amount: "12.34000000", remoteSourceId: "activity:d1" });
  expect(mapBrokerActivity({ remoteActivityId: "f1", type: "FEE", amount: "-1.25", ...base }))
    .toMatchObject({ eventType: "fee", amount: "-1.25000000" });
  expect(mapBrokerActivity({ remoteActivityId: "s1", type: "SPLIT", symbol: "AAPL", quantity: "4", ...base }))
    .toMatchObject({ eventType: "split", quantity: "4.000000000", quantityMultiplier: "4.000000000" });
});

test("derives exact signed fill amounts without Number coercion", () => {
  expect(mapBrokerActivity({ remoteActivityId: "buy", type: "FILL", side: "buy", symbol: "AAPL", quantity: "0.1", price: "0.2", ...base }))
    .toMatchObject({ eventType: "buy", amount: "-0.02000000" });
  expect(mapBrokerActivity({ remoteActivityId: "sell", type: "FILL", side: "sell", symbol: "AAPL", quantity: "9007199254740991", price: "0.00000001", ...base }))
    .toMatchObject({ eventType: "sell", amount: "90071992.54740991" });
});

test("rounds a derived fill amount to the database scale", () => {
  expect(mapBrokerActivity({ remoteActivityId: "minimum", type: "FILL", side: "sell", symbol: "AAPL", quantity: "0.000000001", price: "5", ...base }))
    .toMatchObject({ amount: "0.00000001" });
});

test.each([
  { quantity: "1.0000000001", price: "1" },
  { quantity: "-1", price: "1" },
  { quantity: "1", price: "-1" },
  { quantity: undefined, price: "1" },
])("rejects invalid fill decimals %#", ({ quantity, price }) => {
  expect(() => mapBrokerActivity({ remoteActivityId: "bad", type: "FILL", side: "buy", symbol: "AAPL", quantity, price, ...base }))
    .toThrow(/INVALID_(FIXED_DECIMAL|FILL_DECIMAL)/);
});

test("retains unsupported activity as provenance without inventing ledger semantics", () => {
  expect(mapBrokerActivity({ remoteActivityId: "x1", type: "UNKNOWN", ...base }))
    .toMatchObject({ eventType: "unknown", remoteSourceId: "activity:x1" });
});
