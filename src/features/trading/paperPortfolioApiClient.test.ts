import { expect, test, vi } from "vitest";
import type { ApiRequest } from "../../app/apiClient";
import { PaperPortfolioApiClient } from "./paperPortfolioApiClient";

test("loads the broker ledger from the isolated Paper portfolio route", async () => {
  const requestJson = vi.fn(async (_request: ApiRequest) => []);
  const api = new PaperPortfolioApiClient({ requestJson } as never);

  await api.listLedger();

  expect(requestJson).toHaveBeenCalledWith({ path: "/portfolio/alpaca-paper/ledger" });
});
