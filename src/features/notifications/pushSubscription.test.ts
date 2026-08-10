import { expect, test, vi } from "vitest";
import { revokeBrowserPush, subscribeBrowserPush, urlBase64ToUint8Array } from "./pushSubscription";

test("converts URL-safe VAPID material to the exact application server bytes", () => {
  expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
});

test("reuses an existing browser subscription and persists it with an endpoint-hash idempotency key", async () => {
  const serialized = { endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client", auth: "secret" } };
  const subscription = { endpoint: serialized.endpoint, toJSON: () => serialized, unsubscribe: vi.fn() };
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() } };
  const api = { subscribe: vi.fn(async () => ({ id: "sub-1", endpointHash: "hash" })) };
  const result = await subscribeBrowserPush(registration as never, "AQIDBA", api as never, "Chrome");
  expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  expect(api.subscribe).toHaveBeenCalledWith(serialized, "Chrome", "push-subscription-ddf8b929d0cb630f7434fd1ca248e7389a1649764545cdc724b7505a6c4be6eb");
  expect(result).toBe(subscription);
});

test("creates and revokes a browser subscription with server state kept in sync", async () => {
  const serialized = { endpoint: "https://push.example/two", expirationTime: null, keys: { p256dh: "client", auth: "secret" } };
  const subscription = { endpoint: serialized.endpoint, toJSON: () => serialized, unsubscribe: vi.fn(async () => true) };
  const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) } };
  const api = { subscribe: vi.fn(async () => ({ id: "sub-2" })), revoke: vi.fn(async () => ({ revoked: true })) };
  await subscribeBrowserPush(registration as never, "AQIDBA", api as never, "Chrome");
  expect(registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3, 4]) });
  await revokeBrowserPush(subscription as never, api as never);
  expect(api.revoke).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), expect.stringMatching(/^push-revoke-/));
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
});
