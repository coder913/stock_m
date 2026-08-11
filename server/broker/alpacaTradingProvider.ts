import { z } from "zod";
import type {
  AlpacaTradingPort,
  BrokerAccountSnapshot,
  BrokerActivity,
  BrokerAsset,
  BrokerOrder,
  BrokerPosition,
  PaperOrderRequest,
} from "../../shared/broker";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type BrokerProviderErrorCode = "authentication" | "rate_limit" | "unavailable" | "timeout" | "invalid_response";

export class BrokerProviderError extends Error {
  constructor(
    public readonly code: BrokerProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly ambiguous: boolean,
    public readonly statusCode?: number,
    public readonly retryAfter?: string,
  ) {
    super(message);
  }
}

const accountSchema = z.object({
  id: z.string(),
  status: z.string(),
  currency: z.string(),
  cash: z.string(),
  buying_power: z.string(),
  equity: z.string(),
  portfolio_value: z.string(),
  trading_blocked: z.boolean(),
  account_blocked: z.boolean(),
  created_at: z.string(),
});

const assetSchema = z.object({
  id: z.string(),
  class: z.string(),
  exchange: z.string(),
  symbol: z.string(),
  status: z.string(),
  tradable: z.boolean(),
  fractionable: z.boolean(),
});

const orderSchema = z.object({
  id: z.string(),
  client_order_id: z.string(),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  qty: z.string(),
  filled_qty: z.string(),
  type: z.enum(["market", "limit"]),
  time_in_force: z.enum(["day", "gtc"]),
  limit_price: z.string().nullable().optional(),
  status: z.enum(["accepted", "new", "partially_filled", "filled", "canceled", "rejected", "expired"]),
  submitted_at: z.string(),
  updated_at: z.string(),
  filled_avg_price: z.string().nullable().optional(),
});

const positionSchema = z.object({
  symbol: z.string(),
  qty: z.string(),
  market_value: z.string(),
  avg_entry_price: z.string(),
});

const activitySchema = z.object({
  id: z.string(),
  activity_type: z.string(),
  date: z.string().optional(),
  transaction_time: z.string().optional(),
  net_amount: z.string().optional(),
  symbol: z.string().optional(),
  qty: z.string().optional(),
  price: z.string().optional(),
  side: z.enum(["buy", "sell"]).optional(),
  order_id: z.string().optional(),
}).passthrough();

const PAPER_ORIGIN = "https://paper-api.alpaca.markets";
const activityPageSize = 100;

function normalizeOrder(input: z.infer<typeof orderSchema>): BrokerOrder {
  return {
    remoteOrderId: input.id,
    clientOrderId: input.client_order_id,
    symbol: input.symbol,
    side: input.side,
    quantity: input.qty,
    filledQuantity: input.filled_qty,
    type: input.type,
    timeInForce: input.time_in_force,
    limitPrice: input.limit_price ?? undefined,
    status: input.status,
    submittedAt: input.submitted_at,
    updatedAt: input.updated_at,
    filledAveragePrice: input.filled_avg_price ?? undefined,
  };
}

export class AlpacaTradingProvider implements AlpacaTradingPort {
  private readonly baseUrl: typeof PAPER_ORIGIN;
  private readonly fetcher: FetchLike;
  private readonly requestTimeoutMs: number;

  constructor(input: {
    baseUrl: string;
    keyId: string;
    secretKey: string;
    fetcher?: FetchLike;
    requestTimeoutMs?: number;
  }) {
    if (input.baseUrl !== PAPER_ORIGIN) throw new Error("Alpaca Paper provider requires the exact Paper API origin");
    this.baseUrl = PAPER_ORIGIN;
    this.keyId = input.keyId;
    this.secretKey = input.secretKey;
    this.fetcher = input.fetcher ?? fetch;
    this.requestTimeoutMs = input.requestTimeoutMs ?? 10_000;
  }

  private readonly keyId: string;
  private readonly secretKey: string;

  async getAccount(): Promise<BrokerAccountSnapshot> {
    const response = await this.request("/v2/account", { method: "GET" });
    const value = this.parse(accountSchema, await response.json());
    return {
      accountId: value.id,
      status: value.status,
      currency: value.currency,
      cash: value.cash,
      buyingPower: value.buying_power,
      equity: value.equity,
      portfolioValue: value.portfolio_value,
      tradingBlocked: value.trading_blocked,
      accountBlocked: value.account_blocked,
      createdAt: value.created_at,
      observedAt: new Date().toISOString(),
    };
  }

  async getAsset(symbol: string): Promise<BrokerAsset> {
    const response = await this.request(`/v2/assets/${encodeURIComponent(symbol.toUpperCase())}`, { method: "GET" });
    const value = this.parse(assetSchema, await response.json());
    return {
      assetId: value.id,
      assetClass: value.class,
      exchange: value.exchange,
      symbol: value.symbol,
      status: value.status,
      tradable: value.tradable,
      fractionable: value.fractionable,
    };
  }

  async getPosition(symbol: string): Promise<BrokerPosition | undefined> {
    const response = await this.request(`/v2/positions/${encodeURIComponent(symbol.toUpperCase())}`, { method: "GET" }, false, true);
    if (response.status === 404) return undefined;
    const value = this.parse(positionSchema, await response.json());
    return {
      symbol: value.symbol,
      quantity: value.qty,
      marketValue: value.market_value,
      averageEntryPrice: value.avg_entry_price,
    };
  }

  async submitOrder(input: PaperOrderRequest): Promise<BrokerOrder> {
    const response = await this.request("/v2/orders", {
      method: "POST",
      body: JSON.stringify({
        client_order_id: input.clientOrderId,
        symbol: input.symbol.toUpperCase(),
        side: input.side,
        qty: input.quantity,
        type: input.type,
        time_in_force: input.timeInForce,
        ...(input.limitPrice === undefined ? {} : { limit_price: input.limitPrice }),
        extended_hours: false,
      }),
    }, true);
    return normalizeOrder(this.parse(orderSchema, await response.json()));
  }

  async cancelOrder(remoteOrderId: string): Promise<void> {
    await this.request(`/v2/orders/${encodeURIComponent(remoteOrderId)}`, { method: "DELETE" }, true);
  }

  async getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | undefined> {
    const response = await this.request(`/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`, { method: "GET" }, false, true);
    if (response.status === 404) return undefined;
    return normalizeOrder(this.parse(orderSchema, await response.json()));
  }

  async listOpenOrders(): Promise<BrokerOrder[]> {
    const response = await this.request("/v2/orders?status=open&direction=asc&limit=500", { method: "GET" });
    return this.parse(z.array(orderSchema), await response.json()).map(normalizeOrder);
  }

  async listActivities(after?: string): Promise<BrokerActivity[]> {
    const activities: BrokerActivity[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        direction: "asc",
        page_size: String(activityPageSize),
        ...(after ? { after } : {}),
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const response = await this.request(`/v2/account/activities?${params}`, { method: "GET" });
      const page = this.parse(z.array(activitySchema), await response.json());
      activities.push(...page.map((item) => ({
        remoteActivityId: item.id,
        type: item.activity_type,
        occurredAt: item.transaction_time ?? item.date ?? new Date(0).toISOString(),
        symbol: item.symbol,
        amount: item.net_amount,
        quantity: item.qty,
        price: item.price,
        side: item.side,
        remoteOrderId: item.order_id,
        raw: item,
      })));
      pageToken = page.length === activityPageSize ? page.at(-1)?.id : undefined;
    } while (pageToken);
    return activities;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BrokerProviderError("invalid_response", "Alpaca Paper returned an invalid response", false, false);
    return parsed.data;
  }

  private async request(path: string, init: RequestInit, ambiguousOnTimeout = false, allowNotFound = false): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "APCA-API-KEY-ID": this.keyId,
          "APCA-API-SECRET-KEY": this.secretKey,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
      if (allowNotFound && response.status === 404) return response;
      if (response.status === 401 || response.status === 403) {
        throw new BrokerProviderError("authentication", "Alpaca Paper credentials were rejected", false, false, response.status);
      }
      if (response.status === 429) {
        throw new BrokerProviderError("rate_limit", "Alpaca Paper rate limit exceeded", true, false, 429, response.headers.get("retry-after") ?? undefined);
      }
      if (response.status >= 500) {
        throw new BrokerProviderError("unavailable", "Alpaca Paper is unavailable", true, ambiguousOnTimeout, response.status);
      }
      if (!response.ok) {
        throw new BrokerProviderError("unavailable", `Alpaca Paper request failed with HTTP ${response.status}`, false, false, response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof BrokerProviderError) throw error;
      const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      throw new BrokerProviderError(
        aborted ? "timeout" : "unavailable",
        aborted ? "Alpaca Paper request timed out" : "Alpaca Paper request failed",
        true,
        ambiguousOnTimeout,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
