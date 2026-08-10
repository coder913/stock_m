import { expect, test, vi } from "vitest";
import type { ApiClient } from "../../app/apiClient";
import { WatchlistApiRepository } from "./watchlistApiRepository";

test("normalizes symbols and delegates writes with caller idempotency keys", async () => {
  const requestJson = vi.fn(async () => ({ id: "group-1", name: "AI", symbols: ["NVDA"], order: 0, version: 1 }));
  const repository = new WatchlistApiRepository({ requestJson } as unknown as ApiClient);

  await repository.addSymbol("group-1", " nvda ", "key-1");

  expect(requestJson).toHaveBeenCalledWith({
    method: "POST", path: "/watchlists/group-1/symbols", body: { symbol: "NVDA" }, idempotencyKey: "key-1",
  });
});
