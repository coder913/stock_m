import { ApiClient } from "../../app/apiClient";
import type { BrokerDrift } from "./BrokerDriftBanner";

export interface PaperPortfolioOverviewView {
  source: "alpaca-paper";
  account?: { cash: string; buyingPower: string; equity: string; portfolioValue: string; observedAt: string };
  positions: { symbol: string; quantity: string; marketValue: string; averageEntryPrice: string; observedAt: string }[];
  drift?: BrokerDrift;
  asOf?: string;
}

export interface PaperOrderView {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  orderType: "market" | "limit";
  timeInForce: "day" | "gtc";
  limitPrice?: string;
  confirmedAt: string;
  state: string;
  remoteOrderId?: string;
  updatedAt: string;
}

export interface PaperOrderTimelineEventView {
  id: string;
  orderIntentId: string;
  remoteEventId?: string | null;
  event: string;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface PaperCancelIntentView {
  id?: string;
  orderIntentId?: string;
  status: "cancel_pending";
}

export interface PaperLedgerEventView {
  id: string;
  remoteSourceId: string;
  source: "alpaca-paper";
  eventType: "buy" | "sell" | "dividend" | "fee" | "deposit" | "withdrawal" | "split" | "unknown";
  symbol?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  occurredAt: string;
  provenanceJson: unknown;
}

export interface PaperPortfolioApi {
  getOverview(): Promise<PaperPortfolioOverviewView>;
  listOrders(): Promise<PaperOrderView[]>;
  getTimeline(id: string): Promise<PaperOrderTimelineEventView[]>;
  cancelOrder(id: string, idempotencyKey: string): Promise<PaperCancelIntentView>;
  listLedger(): Promise<PaperLedgerEventView[]>;
  reconcile(key: string): Promise<unknown>;
}

export class PaperPortfolioApiClient implements PaperPortfolioApi {
  constructor(private client = new ApiClient("/api/v1")) {}
  getOverview() { return this.client.requestJson<PaperPortfolioOverviewView>({ path: "/portfolio/alpaca-paper" }); }
  listOrders() { return this.client.requestJson<PaperOrderView[]>({ path: "/portfolio/alpaca-paper/orders" }); }
  getTimeline(id: string) { return this.client.requestJson<PaperOrderTimelineEventView[]>({ path: `/portfolio/alpaca-paper/orders/${id}/timeline` }); }
  cancelOrder(id: string, idempotencyKey: string) {
    return this.client.requestJson<PaperCancelIntentView>({
      method: "POST",
      path: "/broker/alpaca-paper/cancel-intents",
      body: { orderIntentId: id },
      idempotencyKey,
    });
  }
  listLedger() { return this.client.requestJson<PaperLedgerEventView[]>({ path: "/portfolio/alpaca-paper/ledger" }); }
  reconcile(idempotencyKey: string) { return this.client.requestJson({ method: "POST", path: "/portfolio/alpaca-paper/reconciliations", body: {}, idempotencyKey }); }
}
