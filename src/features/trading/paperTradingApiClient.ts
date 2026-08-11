import type { OrderPreview, PaperOrderDraft } from "../../../shared/broker";
import { ApiClient } from "../../app/apiClient";

export interface PaperTradingStatus {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
}

export interface ConfirmedPaperIntent {
  id: string;
  symbol: string;
  status: "pending_submission";
}

export interface PaperTradingApi {
  getStatus(): Promise<PaperTradingStatus>;
  createPreview(input: PaperOrderDraft, idempotencyKey: string): Promise<OrderPreview>;
  createIntent(previewToken: string, idempotencyKey: string): Promise<ConfirmedPaperIntent>;
}

export class PaperTradingApiClient implements PaperTradingApi {
  constructor(private readonly client = new ApiClient("/api/v1")) {}
  getStatus(): Promise<PaperTradingStatus> {
    return this.client.requestJson({ path: "/broker/alpaca-paper/status" });
  }
  createPreview(input: PaperOrderDraft, idempotencyKey: string): Promise<OrderPreview> {
    return this.client.requestJson({ method: "POST", path: "/broker/alpaca-paper/order-previews", body: input, idempotencyKey });
  }
  createIntent(previewToken: string, idempotencyKey: string): Promise<ConfirmedPaperIntent> {
    return this.client.requestJson({ method: "POST", path: "/broker/alpaca-paper/order-intents", body: { previewToken }, idempotencyKey });
  }
}
