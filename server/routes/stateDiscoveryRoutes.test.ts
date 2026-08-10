// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Transaction } from "kysely";
import { buildApp } from "../app";
import type { Database } from "../db/types";
import type { StoredHttpResponse } from "../platform/idempotencyRepository";
import type { StateDiscoveryRouteDependencies } from "./stateDiscoveryRoutes";

function dependencies() {
  const group = { id: "group-1", name: "AI", symbols: [], order: 0, version: 1 };
  const watchlists = {
    list: vi.fn(async () => [group]), listDeleted: vi.fn(async () => []),
    createGroup: vi.fn(async () => group), renameGroup: vi.fn(async () => group),
    addSymbol: vi.fn(async () => ({ ...group, symbols: ["NVDA"] })), removeSymbol: vi.fn(async () => group),
    removeGroup: vi.fn(async () => group), restoreGroup: vi.fn(async () => group), moveGroup: vi.fn(async () => undefined),
  };
  const discovery = {
    getUniverseState: vi.fn(async () => ({ addedSymbols: [], removedDefaultSymbols: [], version: 0 })),
    addUniverseSymbol: vi.fn(), removeUniverseSymbol: vi.fn(), restoreUniverseSymbol: vi.fn(),
    listScreens: vi.fn(async () => []), createScreen: vi.fn(), renameScreen: vi.fn(), duplicateScreen: vi.fn(), removeScreen: vi.fn(),
  };
  const outbox = { append: vi.fn(async () => undefined) };
  const database = { transaction: () => ({ execute: (command: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>) => command({} as Transaction<Database>) }) };
  const idempotency = { execute: vi.fn(async (_transaction, _key, _fingerprint, command) => command()) };
  return { watchlists, discovery, outbox, database, idempotency };
}

test("creates a watchlist through the idempotent route and appends its event", async () => {
  const state = dependencies();
  const app = buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } },
    cache: { health: async () => ({ writable: true, entries: 0 }) },
    stateDiscovery: state as unknown as StateDiscoveryRouteDependencies,
  });

  const response = await app.inject({ method: "POST", url: "/api/v1/watchlists", headers: { "idempotency-key": "key-1" }, payload: { name: " AI " } });

  expect(response.statusCode).toBe(201);
  expect(state.watchlists.createGroup).toHaveBeenCalledWith("AI", expect.anything());
  expect(state.outbox.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "watchlist.changed", aggregateId: "group-1" }));
  await app.close();
});

test("rejects an invalid universe symbol before calling the repository", async () => {
  const state = dependencies();
  const app = buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } },
    cache: { health: async () => ({ writable: true, entries: 0 }) },
    stateDiscovery: state as unknown as StateDiscoveryRouteDependencies,
  });

  const response = await app.inject({ method: "PUT", url: "/api/v1/discovery/universe/NVDA%3Cscript%3E", headers: { "idempotency-key": "key-2" }, payload: { action: "add", version: 0 } });

  expect(response.statusCode).toBe(400);
  expect(state.discovery.addUniverseSymbol).not.toHaveBeenCalled();
  await app.close();
});
