import { afterEach, expect, test, vi } from "vitest";
import { ApiClient, ApiClientError } from "./apiClient";

afterEach(() => vi.restoreAllMocks());

test("sends JSON and an idempotency key through one request boundary", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "group-1" }), {
    status: 201, headers: { "content-type": "application/json" },
  }));
  const client = new ApiClient("/api/v1");

  await expect(client.requestJson({ method: "POST", path: "/watchlists", body: { name: "AI" }, idempotencyKey: "key-1" }))
    .resolves.toEqual({ id: "group-1" });
  expect(fetchSpy).toHaveBeenCalledWith("/api/v1/watchlists", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ name: "AI" }),
    headers: expect.objectContaining({ "content-type": "application/json", "idempotency-key": "key-1" }),
  }));
});

test("parses the server error contract without losing request identity", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    code: "VERSION_CONFLICT", message: "changed", retryable: false, requestId: "req-1",
  }), { status: 409, headers: { "content-type": "application/json" } }));

  await expect(new ApiClient().requestJson({ method: "PATCH", path: "/api/v1/watchlists/group-1", body: {} }))
    .rejects.toEqual(expect.objectContaining({ code: "VERSION_CONFLICT", statusCode: 409, requestId: "req-1" }));
});
