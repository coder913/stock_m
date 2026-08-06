import { beforeEach, expect, test } from "vitest";
import { ReviewRepository } from "./reviewRepository";

beforeEach(() => localStorage.clear());
const input = (overrides: Record<string, unknown> = {}) => ({ week: "2026-W32", snapshot: { asOf: "2026-08-08T12:00:00Z", positions: [], cash: 10_000, totalValue: 10_000, cumulativePnl: 0, drawdownPercent: 0, sectorExposure: {} }, events: [], alerts: [], judgment: "按计划执行", action: "维持仓位", result: "组合稳定", nextObservations: ["NVDA 财报"], ...overrides });

test("creates immutable weekly review versions and snapshot diffs", () => {
  const repository = new ReviewRepository(localStorage); const first = repository.submit(input()); const second = repository.submit(input({ action: "降低集中度", snapshot: { ...input().snapshot, totalValue: 10_500 } }));
  expect(first.version).toBe(1); expect(second.version).toBe(2); expect(repository.diff(first.id, second.id)).toMatchObject({ totalValueChange: 500, changedFields: ["action"] }); expect(Object.isFrozen(repository.getSnapshot(first.snapshotId))).toBe(true);
});

test("allows a no-operation review", () => { const review = new ReviewRepository(localStorage).submit(input({ action: "本周无操作" })); expect(review.summary.tradeCount).toBe(0); });
