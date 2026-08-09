import { beforeEach, expect, test } from "vitest";
import { ThesisReviewRepository } from "./thesisReviewRepository";
import type { ReviewConditionSnapshot } from "./domain";

beforeEach(() => localStorage.clear());

test("records immutable thesis review snapshots in chronological order", () => {
  const repo = new ThesisReviewRepository(localStorage);
  const snapshot: ReviewConditionSnapshot[] = [{ conditionId: "condition-1", conditionVersion: "deadbeef", name: "估值风险", severity: "high", status: "breached" }];
  repo.record({ thesisVersionId: "thesis-1", symbol: "NVDA", decision: "reaffirmed", note: "需求未变", conditionSnapshot: snapshot, createdAt: "2026-08-09T10:00:00Z" });
  snapshot[0].status = "confirmed";
  repo.record({ thesisVersionId: "thesis-1", symbol: "NVDA", decision: "invalidated", note: "需求反转", conditionSnapshot: [], createdAt: "2026-08-10T10:00:00Z" });

  expect(repo.list("thesis-1")[0].conditionSnapshot[0].status).toBe("breached");
  expect(repo.latest("thesis-1")).toMatchObject({ decision: "invalidated", note: "需求反转" });
});

test("rejects active as a review decision", () => {
  const repo = new ThesisReviewRepository(localStorage);
  expect(() => repo.record({ thesisVersionId: "thesis-1", symbol: "NVDA", decision: "active" as "reaffirmed", conditionSnapshot: [], createdAt: "2026-08-09T10:00:00Z" })).toThrow("无效的复核决策");
});

test("isolates malformed persisted reviews", () => {
  localStorage.setItem("stock_m:thesis-reviews:v1", JSON.stringify([
    { id: "review-1", thesisVersionId: "thesis-1", symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: [], createdAt: "2026-08-09T10:00:00Z" },
    { id: "review-2", thesisVersionId: "thesis-1", symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: [{ conditionId: "c", conditionVersion: "deadbeef", name: "rule", severity: "urgent", status: "breached" }], createdAt: "2026-08-09T10:01:00Z" },
  ]));
  const repo = new ThesisReviewRepository(localStorage);

  expect(repo.list("thesis-1")).toEqual([expect.objectContaining({ id: "review-1" })]);
});
