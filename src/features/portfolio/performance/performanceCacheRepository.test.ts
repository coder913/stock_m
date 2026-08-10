import { beforeEach, expect, test } from "vitest";
import type { LedgerEvent, PortfolioSettings } from "../domain";
import type { PerformanceViewModel } from "./domain";
import { PerformanceCacheRepository } from "./performanceCacheRepository";

beforeEach(() => localStorage.clear());

const settings: PortfolioSettings = { version: 1, initialCash: 10_000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: "2026-08-10T00:00:00Z" };
const buyNvda: LedgerEvent = { id: "buy", type: "buy", symbol: "NVDA", quantity: 1, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" };
const deposit: LedgerEvent = { id: "deposit", type: "deposit", amount: 500, reason: "追加", occurredAt: "2026-08-05T15:00:00Z" };
const cacheInput = (overrides: Partial<Parameters<PerformanceCacheRepository["key"]>[0]> = {}) => ({ settings, events: [buyNvda], holdingsAsOf: "2026-08-10T20:00:00Z", benchmarkAsOf: "2026-08-10T20:00:00Z", range: { kind: "inception" }, benchmark: "SPY", algorithmVersion: "1", ...overrides });

test("invalidates cache when ledger or as-of changes", () => {
  const repo = new PerformanceCacheRepository(localStorage);
  const first = repo.key(cacheInput());
  const ledgerChanged = repo.key(cacheInput({ events: [buyNvda, deposit] }));
  const marketChanged = repo.key(cacheInput({ holdingsAsOf: "2026-08-10T21:00:00Z" }));
  expect(ledgerChanged).not.toBe(first);
  expect(marketChanged).not.toBe(first);
});

test("produces the same key for equivalent event order and object keys", () => {
  const repo = new PerformanceCacheRepository(localStorage);
  expect(repo.key(cacheInput({ events: [deposit, buyNvda] }))).toBe(repo.key(cacheInput({ events: [buyNvda, deposit] })));
});

test("isolates a corrupt cached result", () => {
  localStorage.setItem("stock_m:portfolio-performance-cache:v1", JSON.stringify([{ key: "bad", result: { points: "not-array" }, createdAt: "2026-08-10T20:00:00Z" }]));
  expect(new PerformanceCacheRepository(localStorage).get("bad")).toBeUndefined();
});

test("stores immutable results and retains only ten newest entries", () => {
  const repo = new PerformanceCacheRepository(localStorage);
  for (let index = 0; index < 11; index += 1) repo.put(`key-${index}`, { points: [{ marketDate: `2026-08-${String(index + 1).padStart(2, "0")}` }] }, `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`);
  expect(repo.get("key-0")).toBeUndefined();
  const latest = repo.get("key-10");
  expect(latest).toEqual({ points: [{ marketDate: "2026-08-11" }] });
  expect(Object.isFrozen(latest)).toBe(true);
});

test("finds the newest complete view for the same inputs when market as-of changes", () => {
  const repo = new PerformanceCacheRepository(localStorage);
  const firstInput = cacheInput();
  const nextInput = cacheInput({ holdingsAsOf: "2026-08-11T20:00:00Z", benchmarkAsOf: "2026-08-11T20:00:00Z" });
  const identityKey = repo.latestKey(firstInput);
  const view = (marketDate: string): PerformanceViewModel => ({ result: { points: [{ marketDate }], summary: { from: marketDate, to: marketDate }, dailyInternals: [], interval: { beginningValue: 0, endingValue: 0, deposits: 0, withdrawals: 0 }, warnings: [] } as unknown as PerformanceViewModel["result"], pendingSplits: [], notices: [], dataState: "fresh", provenance: { source: "alpaca" } });
  const older = view("2026-08-10");
  const newer = view("2026-08-11");

  repo.put(repo.key(firstInput), older, "2026-08-10T21:00:00Z", identityKey);
  repo.put(repo.key(nextInput), newer, "2026-08-11T21:00:00Z", repo.latestKey(nextInput));

  expect(repo.getLatest(identityKey)).toEqual(newer);
});
