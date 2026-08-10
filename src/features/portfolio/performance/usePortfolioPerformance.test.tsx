import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PortfolioSettings } from "../domain";
import type { PerformanceViewModel } from "./domain";
import { PerformanceCacheRepository } from "./performanceCacheRepository";
import { usePortfolioPerformance } from "./usePortfolioPerformance";

beforeEach(() => localStorage.clear());

const settings: PortfolioSettings = { version: 1, initialCash: 10_000, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD", updatedAt: "2026-08-10T00:00:00Z" };
const range = { kind: "inception" } as const;
const events = [{ id: "buy", type: "buy" as const, symbol: "NVDA", quantity: 1, price: 100, thesisVersionId: "t1", occurredAt: "2026-08-04T15:00:00Z" }];
const ignoredSplitIds: string[] = [];
const cachedModel: PerformanceViewModel = {
  result: {
    points: [],
    summary: { from: "2026-08-04", to: "2026-08-10", twr: 0.02 },
    dailyInternals: [],
    interval: { beginningValue: 10_000, endingValue: 10_200, deposits: 0, withdrawals: 0 },
    warnings: [],
  },
  pendingSplits: [],
  notices: [],
  dataState: "fresh",
  provenance: { source: "alpaca", asOf: "2026-08-10T20:00:00Z" },
};

test("hydrates the latest cached view and keeps it as stale when refresh fails", async () => {
  const repo = new PerformanceCacheRepository(localStorage);
  const keyInput = { settings, events, range, benchmark: "SPY", algorithmVersion: "1" };
  repo.put(repo.key(keyInput), cachedModel, "2026-08-10T21:00:00Z", repo.latestKey(keyInput));
  const client = { getBatchBars: vi.fn().mockRejectedValue(new Error("offline")), getEvents: vi.fn().mockRejectedValue(new Error("offline")) };

  const { result } = renderHook(() => usePortfolioPerformance({ enabled: true, client, settings, events, ignoredSplitIds, range, revision: 0 }));

  await waitFor(() => expect(result.current.state.status).toBe("error"));
  expect(result.current.state.status === "error" && result.current.state.cached).toMatchObject({
    dataState: "stale",
    result: { summary: { twr: 0.02 } },
  });
});

test("ignores an older refresh that resolves after a newer request", async () => {
  const envelope = (asOf: string, close: number) => ({
    data: { symbols: { SPY: [{ symbol: "SPY", startedAt: `${asOf.slice(0, 10)}T20:00:00Z`, open: close, high: close, low: close, close, adjusted: true }] }, missingSymbols: [] },
    source: "alpaca" as const,
    asOf,
    fetchedAt: asOf,
    expiresAt: asOf,
    stale: false,
    notices: [`close:${close}`],
  });
  let resolveOlder!: (value: ReturnType<typeof envelope>) => void;
  const getBatchBars = vi.fn()
    .mockImplementationOnce(() => new Promise<ReturnType<typeof envelope>>((resolve) => { resolveOlder = resolve; }))
    .mockResolvedValueOnce(envelope("2026-08-10T21:00:00Z", 110));
  const client = { getBatchBars, getEvents: vi.fn() };
  const emptyEvents: [] = [];
  const { result, rerender } = renderHook(({ revision }) => usePortfolioPerformance({ enabled: true, client, settings, events: emptyEvents, ignoredSplitIds, range, revision }), { initialProps: { revision: 0 } });

  rerender({ revision: 1 });
  await waitFor(() => expect(result.current.state.status === "ready" && result.current.state.model.notices).toContain("close:110"));
  await act(async () => { resolveOlder(envelope("2026-08-09T21:00:00Z", 90)); await Promise.resolve(); });
  expect(result.current.state.status === "ready" && result.current.state.model.notices).toContain("close:110");
  expect(result.current.state.status === "ready" && result.current.state.model.notices).not.toContain("close:90");
});
