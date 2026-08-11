// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Transaction } from "kysely";
import { buildApp } from "../app";
import type { Database } from "../db/types";
import type { PaperTradingRouteDependencies } from "./paperTradingRoutes";

const config = {
  host: "127.0.0.1",
  port: 1,
  providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } },
  publicStatus: { providers: {}, paperTrading: { enabled: true, configured: true } },
};

function harness() {
  const transaction = {} as Transaction<Database>;
  const repository = {
    recordPreviewAudit: vi.fn(async () => undefined),
    createOrderIntent: vi.fn(async (input) => ({ ...input, confirmedAt: "2026-08-11T14:00:00Z" })),
    hasActiveDrift: vi.fn(async () => false),
  };
  const outbox = { append: vi.fn(async () => undefined) };
  const preview = {
    preview: vi.fn(async () => ({
      previewId: "00000000-0000-4000-8000-000000000101",
      expiresAt: "2026-08-11T14:01:00.000Z",
      normalizedOrder: { symbol: "NVDA", side: "buy", quantity: "1.00000000", type: "market", timeInForce: "day" },
      estimatedNotional: "100.00000000",
      quote: { price: "100.00000000", source: "alpaca", asOf: "2026-08-11T13:59:55Z" },
      buyingPower: "10000.00000000",
      positionBefore: "0.00000000",
      estimatedPositionAfter: "1.00000000",
      warnings: ["Paper execution price is not guaranteed"],
      token: "signed-preview",
    })),
    verify: vi.fn(() => ({
      previewId: "00000000-0000-4000-8000-000000000101",
      expiresAt: "2026-08-11T14:01:00.000Z",
      normalizedOrder: { symbol: "NVDA", side: "buy", quantity: "1.00000000", type: "market", timeInForce: "day" },
    })),
  };
  const dependencies = {
    status: { enabled: true, configured: true },
    database: { transaction: () => ({
      execute: (callback: (value: Transaction<Database>) => Promise<unknown>) => callback(transaction),
    }) },
    idempotency: { execute: vi.fn(async (_tx, _key, _fingerprint, command) => command()) },
    outbox,
    repository,
    preview,
    now: () => new Date("2026-08-11T14:00:00Z"),
  } as unknown as PaperTradingRouteDependencies;
  return { dependencies, repository, outbox, preview, transaction };
}

test("reports Paper readiness without exposing credentials", async () => {
  const context = harness();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, paperTrading: context.dependencies });
  const response = await app.inject({ method: "GET", url: "/api/v1/broker/alpaca-paper/status" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ enabled: true, configured: true, ready: true });
  expect(response.body).not.toContain("paper-secret");
  await app.close();
});

test("stores a preview audit without persisting its reusable token", async () => {
  const context = harness();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, paperTrading: context.dependencies });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/broker/alpaca-paper/order-previews",
    headers: { "idempotency-key": "preview-key" },
    payload: { symbol: "NVDA", side: "buy", quantity: "1", type: "market", timeInForce: "day" },
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().token).toBe("signed-preview");
  expect(context.repository.recordPreviewAudit).toHaveBeenCalledWith(expect.objectContaining({ previewId: expect.any(String) }), context.transaction);
  expect(JSON.stringify(context.repository.recordPreviewAudit.mock.calls)).not.toContain("signed-preview");
  await app.close();
});

test("confirms an intent and Outbox command in the same idempotent transaction", async () => {
  const context = harness();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, paperTrading: context.dependencies });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/broker/alpaca-paper/order-intents",
    headers: { "idempotency-key": "intent-key" },
    payload: { previewToken: "signed-preview" },
  });

  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({ status: "pending_submission", symbol: "NVDA" });
  expect(context.repository.createOrderIntent).toHaveBeenCalledWith(expect.objectContaining({ clientOrderId: expect.stringMatching(/^stockm-/) }), context.transaction);
  expect(context.outbox.append).toHaveBeenCalledWith(context.transaction, expect.objectContaining({ topic: "broker.order.submit.requested" }));
  await app.close();
});

test("does not expose an order-intent route under the monitor namespace", async () => {
  const context = harness();
  const app = buildApp({ config, cache: { health: async () => ({ writable: true, entries: 0 }) }, paperTrading: context.dependencies });
  expect(app.hasRoute({ method: "POST", url: "/api/v1/monitor/order-intents" })).toBe(false);
  await app.close();
});
