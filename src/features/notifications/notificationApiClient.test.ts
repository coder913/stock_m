import { expect, test, vi } from "vitest";
import { NotificationApiClient } from "./notificationApiClient";
import type { ApiRequest } from "../../app/apiClient";

test("uses the public notification routes and forwards deterministic idempotency keys", async () => {
  const requestJson = vi.fn(async (_request: ApiRequest) => ({ configured: true, publicKey: "public", subscriptions: [] }));
  const api = new NotificationApiClient({ requestJson } as never);
  await api.getStatus();
  await api.subscribe({ endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client", auth: "secret" } }, "Chrome", "push-sub-hash");
  await api.revoke("endpoint-hash", "push-revoke-hash");
  await api.test("push-test-1");

  expect(requestJson.mock.calls.map(([request]) => request)).toEqual([
    { path: "/notifications/status" },
    { method: "POST", path: "/notifications/subscriptions", body: { subscription: { endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client", auth: "secret" } }, userAgent: "Chrome" }, idempotencyKey: "push-sub-hash" },
    { method: "DELETE", path: "/notifications/subscriptions/endpoint-hash", idempotencyKey: "push-revoke-hash" },
    { method: "POST", path: "/notifications/test", body: {}, idempotencyKey: "push-test-1" },
  ]);
});
