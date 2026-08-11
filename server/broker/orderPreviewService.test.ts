// @vitest-environment node
import { describe, expect, test } from "vitest";
import { OrderPreviewService, type OrderPreviewDependencies } from "./orderPreviewService";

const dependencies = (overrides: Partial<OrderPreviewDependencies> = {}): OrderPreviewDependencies => ({
  enabled: true,
  now: () => new Date("2026-08-11T14:00:00Z"),
  loadAccount: async () => ({ buyingPower: "10000.00000000", equity: "20000.00000000" }),
  loadAsset: async (symbol) => ({ symbol, status: "active", tradable: true, fractionable: true }),
  loadQuote: async () => ({ price: "100.00000000", source: "alpaca", asOf: "2026-08-11T13:59:55Z", state: "fresh" }),
  loadPosition: async () => ({ quantity: "2.000000000" }),
  hasActiveDrift: async () => false,
  tokens: { issue: () => "signed-preview" },
  ...overrides,
});

const base = {
  symbol: "nvda",
  side: "buy" as const,
  quantity: "1.50000000",
  type: "market" as const,
  timeInForce: "day" as const,
};

test("creates a 60-second signed preview with exact decimal notional", async () => {
  const preview = await new OrderPreviewService(dependencies()).preview(base);

  expect(preview).toMatchObject({
    expiresAt: "2026-08-11T14:01:00.000Z",
    normalizedOrder: { symbol: "NVDA", quantity: "1.500000000" },
    estimatedNotional: "150.00000000",
    buyingPower: "10000.00000000",
    positionBefore: "2.000000000",
    estimatedPositionAfter: "3.500000000",
    token: "signed-preview",
  });
});

describe.each([
  ["PAPER_TRADING_DISABLED", dependencies({ enabled: false }), base],
  ["BROKER_DRIFT_ACTIVE", dependencies({ hasActiveDrift: async () => true }), base],
  ["FRESH_QUOTE_REQUIRED", dependencies({ loadQuote: async () => ({ price: "100", source: "alpaca", asOf: "2026-08-11T13:00:00Z", state: "stale" }) }), base],
  ["ASSET_NOT_TRADABLE", dependencies({ loadAsset: async (symbol) => ({ symbol, status: "inactive", tradable: false, fractionable: false }) }), base],
  ["FRACTIONAL_ORDER_UNSUPPORTED", dependencies({ loadAsset: async (symbol) => ({ symbol, status: "active", tradable: true, fractionable: false }) }), base],
  ["FRACTIONAL_ORDER_UNSUPPORTED", dependencies(), { ...base, type: "limit" as const, limitPrice: "99", timeInForce: "gtc" as const }],
  ["INSUFFICIENT_PAPER_POSITION", dependencies(), { ...base, side: "sell" as const, quantity: "2.000000001" }],
  ["INSUFFICIENT_BUYING_POWER", dependencies({ loadAccount: async () => ({ buyingPower: "100", equity: "20000" }) }), { ...base, quantity: "2" }],
  ["LIMIT_PRICE_REQUIRED", dependencies(), { ...base, quantity: "1", type: "limit" as const }],
] as const)("preflight failure %s", (code, deps, request) => {
  test("blocks the preview", async () => {
    await expect(new OrderPreviewService(deps).preview(request)).rejects.toMatchObject({ code });
  });
});
