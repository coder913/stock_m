// @vitest-environment node
import { expect, test, vi } from "vitest";
import { AlpacaTradingProvider } from "./alpacaTradingProvider";

const accountPayload = {
  id: "account-paper-1",
  status: "ACTIVE",
  currency: "USD",
  cash: "10000.25",
  buying_power: "20000.50",
  equity: "12500.75",
  portfolio_value: "12500.75",
  trading_blocked: false,
  account_blocked: false,
  created_at: "2026-08-01T00:00:00Z",
};

const assetPayload = {
  id: "asset-nvda",
  class: "us_equity",
  exchange: "NASDAQ",
  symbol: "NVDA",
  status: "active",
  tradable: true,
  fractionable: true,
};

const orderPayload = {
  id: "order-1",
  client_order_id: "stockm-order-1",
  symbol: "NVDA",
  side: "buy",
  qty: "1.5",
  filled_qty: "0.5",
  type: "limit",
  time_in_force: "day",
  limit_price: "165.25",
  status: "partially_filled",
  submitted_at: "2026-08-11T13:30:00Z",
  updated_at: "2026-08-11T13:31:00Z",
  filled_avg_price: "165.10",
};

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

test("normalizes Paper account and asset decimal fields without numeric coercion", async () => {
  const fetcher = vi.fn(async (input: string) => input.endsWith("/v2/account")
    ? json(accountPayload)
    : json(assetPayload));
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    fetcher,
  });

  await expect(provider.getAccount()).resolves.toMatchObject({
    accountId: "account-paper-1",
    status: "ACTIVE",
    cash: "10000.25",
    buyingPower: "20000.50",
    equity: "12500.75",
    tradingBlocked: false,
  });
  await expect(provider.getAsset("nvda")).resolves.toEqual({
    assetId: "asset-nvda",
    assetClass: "us_equity",
    exchange: "NASDAQ",
    symbol: "NVDA",
    status: "active",
    tradable: true,
    fractionable: true,
  });
});

test("maps submit payload exactly and normalizes the returned order", async () => {
  let submittedBody: unknown;
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    fetcher: async (_input, init) => {
      submittedBody = JSON.parse(String(init?.body));
      return json(orderPayload);
    },
  });

  const order = await provider.submitOrder({
    clientOrderId: "stockm-order-1",
    symbol: "nvda",
    side: "buy",
    quantity: "1.5",
    type: "limit",
    timeInForce: "day",
    limitPrice: "165.25",
  });

  expect(submittedBody).toEqual({
    client_order_id: "stockm-order-1",
    symbol: "NVDA",
    side: "buy",
    qty: "1.5",
    type: "limit",
    time_in_force: "day",
    limit_price: "165.25",
    extended_hours: false,
  });
  expect(order).toMatchObject({
    remoteOrderId: "order-1",
    clientOrderId: "stockm-order-1",
    quantity: "1.5",
    filledQuantity: "0.5",
    status: "partially_filled",
  });
});

test("cancels by remote order id and returns undefined only for an explicit lookup 404", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    fetcher: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET" });
      return init?.method === "DELETE" ? json(undefined, 204) : json({ code: 40410000, message: "order not found" }, 404);
    },
  });

  await expect(provider.cancelOrder("remote/1")).resolves.toBeUndefined();
  await expect(provider.getOrderByClientOrderId("stockm-order-1")).resolves.toBeUndefined();
  expect(requests).toEqual([
    { url: "https://paper-api.alpaca.markets/v2/orders/remote%2F1", method: "DELETE" },
    { url: "https://paper-api.alpaca.markets/v2/orders:by_client_order_id?client_order_id=stockm-order-1", method: "GET" },
  ]);
});

test("paginates account activities with the last activity id", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    activity_type: "DIV",
    id: `activity-${String(index + 1).padStart(3, "0")}`,
    date: "2026-08-10",
    net_amount: "1.00",
    symbol: "NVDA",
  }));
  const urls: string[] = [];
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    fetcher: async (input) => {
      urls.push(String(input));
      return json(urls.length === 1 ? firstPage : [{
        activity_type: "FEE",
        id: "activity-101",
        date: "2026-08-11",
        net_amount: "-0.25",
      }]);
    },
  });

  const activities = await provider.listActivities("2026-08-01T00:00:00Z");

  expect(activities).toHaveLength(101);
  expect(urls[0]).toContain("after=2026-08-01T00%3A00%3A00Z");
  expect(urls[1]).toContain("page_token=activity-100");
  expect(activities.at(-1)).toMatchObject({ remoteActivityId: "activity-101", type: "FEE", amount: "-0.25" });
});

test.each([
  [401, "authentication", false, false],
  [429, "rate_limit", true, false],
  [503, "unavailable", true, false],
] as const)("classifies HTTP %s provider failures", async (status, code, retryable, ambiguous) => {
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    fetcher: async () => json({ message: "failure" }, status, status === 429 ? { "retry-after": "30" } : undefined),
  });

  await expect(provider.getAccount()).rejects.toMatchObject({ code, retryable, ambiguous });
});

test("classifies an aborted submit as ambiguous so callers cannot blindly retry", async () => {
  const provider = new AlpacaTradingProvider({
    baseUrl: "https://paper-api.alpaca.markets",
    keyId: "paper-id",
    secretKey: "paper-secret",
    requestTimeoutMs: 5,
    fetcher: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  });

  await expect(provider.submitOrder({
    clientOrderId: "stockm-order-timeout",
    symbol: "NVDA",
    side: "buy",
    quantity: "1",
    type: "market",
    timeInForce: "day",
  })).rejects.toMatchObject({ code: "timeout", retryable: true, ambiguous: true });
});
