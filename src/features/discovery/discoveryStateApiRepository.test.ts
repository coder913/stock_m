import { expect, test, vi } from "vitest";
import type { ApiClient } from "../../app/apiClient";
import { DiscoveryStateApiRepository } from "./discoveryStateApiRepository";

test("sends optimistic screen versions on rename", async () => {
  const requestJson = vi.fn(async () => ({ id: "screen-1", name: "Quality", conditions: [], sort: { metric: "price", direction: "asc" }, version: 3 }));
  const repository = new DiscoveryStateApiRepository({ requestJson } as unknown as ApiClient);

  await repository.renameScreen("screen-1", "Quality", 2, "key-2");

  expect(requestJson).toHaveBeenCalledWith({ method: "PATCH", path: "/discovery/screens/screen-1", body: { name: "Quality", version: 2 }, idempotencyKey: "key-2" });
});
