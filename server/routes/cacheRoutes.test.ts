// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "../app";
import { RefreshRegistry } from "../core/refreshRegistry";

test("rejects a manual refresh for a resource that has no registered handler", async () => {
  const app = buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } },
    cache: { health: () => ({ writable: true, entries: 0 }) },
    refreshRegistry: new RefreshRegistry(),
  });

  const response = await app.inject({ method: "POST", url: "/api/cache/refresh", payload: { resource: "quotes", symbols: ["NVDA"] } });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ code: "REFRESH_RESOURCE_UNAVAILABLE" });
  await app.close();
});
