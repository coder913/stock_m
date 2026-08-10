// @vitest-environment node
import { expect, test } from "vitest";
import { InternalSnapshotClient, InternalSnapshotError } from "./internalSnapshotClient";

const request = { requirements: [{ symbol: "NVDA", metrics: ["price" as const], eventWindows: [] }], evaluatedAt: "2026-08-10T14:07:00Z" };

test("loads one authenticated batch and returns snapshots by symbol", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.headers && (init.headers as Record<string, string>).authorization === "Bearer service-token") {
      return new Response(JSON.stringify({ snapshots: { NVDA: { symbol: "NVDA", metrics: {}, events: [], eventsState: "fresh", generatedAt: request.evaluatedAt } }, provenance: { dataState: "fresh", sources: [], generatedAt: request.evaluatedAt } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ code: "UNAUTHORIZED", retryable: false }), { status: 401 });
  };
  const result = await new InternalSnapshotClient("http://web-api:8787", "service-token", fetcher).load(request);
  expect(result.snapshots.get("NVDA")).toMatchObject({ symbol: "NVDA", eventsState: "fresh" });
  expect(result.provenance.dataState).toBe("fresh");
});

test("classifies retryable gateway failures", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "down", retryable: true }), { status: 503, headers: { "content-type": "application/json" } });
  const client = new InternalSnapshotClient("http://web-api:8787", "service-token", fetcher);
  await expect(client.load(request)).rejects.toEqual(expect.objectContaining<Partial<InternalSnapshotError>>({ code: "PROVIDER_UNAVAILABLE", retryable: true }));
});
