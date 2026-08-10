// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "../app";
import type { MonitorSnapshot } from "../../shared/monitoring";

const snapshot: MonitorSnapshot = {
  symbol: "NVDA",
  metrics: { price: { value: 181, source: "alpaca", asOf: "2026-08-10T14:05:00Z", dataState: "fresh", notices: [] } },
  events: [], eventsState: "fresh", generatedAt: "2026-08-10T14:07:00Z",
};

function app() {
  return buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: true }, fred: { configured: true } }, publicStatus: { providers: {} } },
    cache: { health: async () => ({ writable: true, entries: 0 }) },
    internalSnapshots: {
      token: "exact-internal-service-token",
      loader: { load: async () => new Map([["NVDA", snapshot]]) },
    },
  });
}

const payload = {
  requirements: [{ symbol: "nvda", metrics: ["price"], eventWindows: [] }],
  evaluatedAt: "2026-08-10T14:07:00Z",
};

test("internal snapshots require the exact bearer token", async () => {
  const server = app();
  expect((await server.inject({ method: "POST", url: "/internal/v1/monitor-snapshots", payload })).statusCode).toBe(401);
  expect((await server.inject({ method: "POST", url: "/internal/v1/monitor-snapshots", headers: { authorization: "Bearer exact-internal-service-token-x" }, payload })).statusCode).toBe(401);
  await server.close();
});

test("returns normalized snapshots with aggregate provenance", async () => {
  const server = app();
  const response = await server.inject({ method: "POST", url: "/internal/v1/monitor-snapshots", headers: { authorization: "Bearer exact-internal-service-token" }, payload });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    snapshots: { NVDA: snapshot },
    provenance: { dataState: "fresh", sources: ["alpaca"], generatedAt: "2026-08-10T14:07:00Z" },
  });
  await server.close();
});
