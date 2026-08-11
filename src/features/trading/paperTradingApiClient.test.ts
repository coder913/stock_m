import { expect, test, vi } from "vitest";
import type { ApiRequest } from "../../app/apiClient";
import { PaperTradingApiClient } from "./paperTradingApiClient";

test("uses only stock_m broker routes and forwards deterministic idempotency keys", async () => {
  const requestJson = vi.fn(async (_request: ApiRequest) => ({}));
  const api = new PaperTradingApiClient({ requestJson } as never);
  const draft = { symbol: "NVDA", side: "buy" as const, quantity: "1", type: "market" as const, timeInForce: "day" as const };

  await api.getStatus();
  await api.createPreview(draft, "preview-key");
  await api.createIntent("signed-preview", "intent-key");

  expect(requestJson.mock.calls.map(([request]) => request)).toEqual([
    { path: "/broker/alpaca-paper/status" },
    { method: "POST", path: "/broker/alpaca-paper/order-previews", body: draft, idempotencyKey: "preview-key" },
    { method: "POST", path: "/broker/alpaca-paper/order-intents", body: { previewToken: "signed-preview" }, idempotencyKey: "intent-key" },
  ]);
});
