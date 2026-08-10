// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Transaction } from "kysely";
import { buildApp } from "../app";
import type { Database } from "../db/types";

const config = { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } };
function dependencies(configured = true) {
  const repository = { upsert: vi.fn(async () => ({ id: "sub-1", endpointHash: "hash-1", userAgent: "Chrome", createdAt: "2026-08-10T10:00:00Z", lastSeenAt: "2026-08-10T10:00:00Z" })), revoke: vi.fn(async () => true), list: vi.fn(async () => []) };
  const outbox = { append: vi.fn(async () => undefined) };
  const database = { transaction: () => ({ execute: (command: (transaction: Transaction<Database>) => Promise<unknown>) => command({} as Transaction<Database>) }) };
  const idempotency = { execute: vi.fn(async (_tx, _key, _fingerprint, command) => command()) };
  return { configured, publicKey: configured ? "public-vapid" : undefined, repository, outbox, database, idempotency };
}

test("status exposes only public configuration and subscription mutations omit private keys", async () => {
  const notifications = dependencies();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, notifications: notifications as never });
  expect((await app.inject({ method: "GET", url: "/api/v1/notifications/status" })).json()).toEqual({ configured: true, publicKey: "public-vapid", subscriptions: [] });
  const response = await app.inject({ method: "POST", url: "/api/v1/notifications/subscriptions", headers: { "idempotency-key": "sub-create" }, payload: { subscription: { endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client-key", auth: "auth-secret" } }, userAgent: "Chrome" } });
  expect(response.statusCode).toBe(201);
  expect(response.body).not.toContain("auth-secret");
  await app.close();
});

test("test notification emits a durable command and unconfigured servers reject mutation", async () => {
  const notifications = dependencies();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, notifications: notifications as never });
  expect((await app.inject({ method: "POST", url: "/api/v1/notifications/test", headers: { "idempotency-key": "test-push" }, payload: {} })).statusCode).toBe(202);
  expect(notifications.outbox.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "notification.test.requested" }));
  await app.close();
  const disabled = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, notifications: dependencies(false) as never });
  expect((await disabled.inject({ method: "POST", url: "/api/v1/notifications/subscriptions", headers: { "idempotency-key": "disabled" }, payload: {} })).statusCode).toBe(503);
  await disabled.close();
});
