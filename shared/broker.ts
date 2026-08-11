export type BrokerOrderStatus =
  | "accepted"
  | "new"
  | "partially_filled"
  | "filled"
  | "canceled"
  | "rejected"
  | "expired";

export type PaperOrderType = "market" | "limit";
export type PaperTimeInForce = "day" | "gtc";

export interface PaperOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  type: PaperOrderType;
  timeInForce: PaperTimeInForce;
  limitPrice?: string;
}

export interface BrokerAccountSnapshot {
  accountId: string;
  status: string;
  currency: string;
  cash: string;
  buyingPower: string;
  equity: string;
  portfolioValue: string;
  tradingBlocked: boolean;
  accountBlocked: boolean;
  createdAt: string;
  observedAt: string;
}

export interface BrokerAsset {
  assetId: string;
  assetClass: string;
  exchange: string;
  symbol: string;
  status: string;
  tradable: boolean;
  fractionable: boolean;
}

export interface BrokerOrder {
  remoteOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  filledQuantity: string;
  type: PaperOrderType;
  timeInForce: PaperTimeInForce;
  limitPrice?: string;
  status: BrokerOrderStatus;
  submittedAt: string;
  updatedAt: string;
  filledAveragePrice?: string;
}

export interface BrokerActivity {
  remoteActivityId: string;
  type: string;
  occurredAt: string;
  symbol?: string;
  amount?: string;
  quantity?: string;
  price?: string;
  side?: "buy" | "sell";
  remoteOrderId?: string;
  raw: Record<string, unknown>;
}

export interface AlpacaTradingPort {
  getAccount(): Promise<BrokerAccountSnapshot>;
  getAsset(symbol: string): Promise<BrokerAsset>;
  submitOrder(input: PaperOrderRequest): Promise<BrokerOrder>;
  cancelOrder(remoteOrderId: string): Promise<void>;
  getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | undefined>;
  listOpenOrders(): Promise<BrokerOrder[]>;
  listActivities(after?: string): Promise<BrokerActivity[]>;
}
