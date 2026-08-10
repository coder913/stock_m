// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Transaction } from "kysely";
import { buildApp } from "../app";
import type { Database } from "../db/types";
import type { StoredHttpResponse } from "../platform/idempotencyRepository";
import type { ThesisStateRouteDependencies } from "./thesisStateRoutes";

function dependencies() {
  const thesis = { id: "thesis-1", symbol: "NVDA", version: 1, coreJudgment: "AI demand", evidence: ["revenue"], risks: ["valuation"], validationConditions: ["earnings"], createdAt: "2026-08-10T08:00:00.000Z" };
  const repository = { listLatest: vi.fn(async () => [thesis]), getLatest: vi.fn(async () => thesis), getHistory: vi.fn(async () => [thesis]), create: vi.fn(async () => thesis), listConditions: vi.fn(async () => []), createConditions: vi.fn(async () => []), softDeleteCondition: vi.fn(), copyConditions: vi.fn(async () => []) };
  const outbox = { append: vi.fn(async () => undefined) };
  const database = { transaction: () => ({ execute: (command: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>) => command({} as Transaction<Database>) }) };
  const idempotency = { execute: vi.fn(async (_transaction, _key, _fingerprint, command) => command()) };
  return { repository, outbox, database, idempotency };
}

test("creates an immutable thesis version through an idempotent command", async () => {
  const state = dependencies();
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, thesisState: state as unknown as ThesisStateRouteDependencies });
  const payload = { symbol: "NVDA", coreJudgment: "AI demand", evidence: ["revenue"], risks: ["valuation"], validationConditions: ["earnings"] };
  const response = await app.inject({ method: "POST", url: "/api/v1/theses", headers: { "idempotency-key": "thesis-create-1" }, payload });
  expect(response.statusCode).toBe(201);
  expect(state.repository.create).toHaveBeenCalledWith(payload, expect.anything());
  expect(state.outbox.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "thesis.version.created", aggregateId: "thesis-1" }));
  await app.close();
});

test("serves latest thesis and its history", async () => {
  const state = dependencies();
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, thesisState: state as unknown as ThesisStateRouteDependencies });
  expect((await app.inject({ method: "GET", url: "/api/v1/theses/NVDA/latest" })).statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: "/api/v1/theses/NVDA/history" })).json()).toHaveLength(1);
  await app.close();
});

test("returns a null latest thesis for a symbol with no history", async () => {
  const state = dependencies();
  state.repository.getLatest.mockResolvedValueOnce(undefined as never);
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, thesisState: state as unknown as ThesisStateRouteDependencies });
  const response = await app.inject({ method: "GET", url: "/api/v1/theses/MSFT/latest" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toBeNull();
  await app.close();
});
