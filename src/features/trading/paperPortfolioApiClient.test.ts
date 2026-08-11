import { expect, test, vi } from "vitest";
import type { ApiRequest } from "../../app/apiClient";
import { PaperPortfolioApiClient } from "./paperPortfolioApiClient";

test("loads the broker ledger from the isolated Paper portfolio route", async () => {
  const requestJson = vi.fn(async (_request: ApiRequest) => []);
  const api = new PaperPortfolioApiClient({ requestJson } as never);

  await api.listLedger();

  expect(requestJson).toHaveBeenCalledWith({ path: "/portfolio/alpaca-paper/ledger" });
});

test("creates an idempotent cancel intent for a Paper order", async () => {
  const requestJson = vi.fn(async (_request: ApiRequest) => ({ status: "cancel_pending" }));
  const api = new PaperPortfolioApiClient({ requestJson } as never);

  await api.cancelOrder("order-1", "cancel-key");

  expect(requestJson).toHaveBeenCalledWith({
    method: "POST",
    path: "/broker/alpaca-paper/cancel-intents",
    body: { orderIntentId: "order-1" },
    idempotencyKey: "cancel-key",
  });
});
