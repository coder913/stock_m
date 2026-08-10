// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "./app";

test("health reports safe configuration and writable cache status", async () => {
  const app = buildApp({
    config: {
      host: "127.0.0.1",
      port: 8787,
      providers: {
        alpaca: { configured: false },
        sec: { configured: true },
        finnhub: { configured: false },
        fred: { configured: false },
      },
      publicStatus: { providers: {} },
    },
    cache: {
      health: () => ({ writable: true, entries: 0, oldestFetchedAt: undefined }),
    },
  });

  const response = await app.inject({ method: "GET", url: "/api/health" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    providers: { alpaca: { configured: false }, sec: { configured: true } },
    cache: { writable: true, entries: 0 },
  });
  expect(response.body).not.toContain("API_KEY");
  await app.close();
});

test("requires an idempotency key for public API mutations", async () => {
  const app = buildApp({
    config: {
      host: "127.0.0.1",
      port: 8787,
      providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } },
      publicStatus: { providers: {} },
    },
    cache: { health: () => ({ writable: true, entries: 0 }) },
  });
  app.post("/api/v1/test-command", async () => ({ ok: true }));

  const response = await app.inject({ method: "POST", url: "/api/v1/test-command", payload: { symbol: "NVDA" } });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED", retryable: false });
  expect(response.json().requestId).toEqual(expect.any(String));
  await app.close();
});
