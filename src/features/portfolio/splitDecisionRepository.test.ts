import { beforeEach, expect, test } from "vitest";
import { SplitDecisionRepository } from "./splitDecisionRepository";

beforeEach(() => localStorage.clear());

test("requires a note and stores one immutable ignored split decision", () => {
  const repo = new SplitDecisionRepository(localStorage);
  expect(() => repo.ignore({
    sourceEventId: "alpaca:action:nvda-split",
    symbol: "NVDA",
    note: "",
    ignoredAt: "2026-08-10T10:00:00Z",
  })).toThrow("备注");

  const first = repo.ignore({
    sourceEventId: "alpaca:action:nvda-split",
    symbol: "NVDA",
    note: "供应商事件与持仓无关",
    ignoredAt: "2026-08-10T10:00:00Z",
  });
  const duplicate = repo.ignore({
    sourceEventId: "alpaca:action:nvda-split",
    symbol: "NVDA",
    note: "第二次备注",
    ignoredAt: "2026-08-10T11:00:00Z",
  });

  expect(repo.list()).toEqual([expect.objectContaining({ sourceEventId: "alpaca:action:nvda-split" })]);
  expect(duplicate).toEqual(first);
  expect(Object.isFrozen(first)).toBe(true);
});

test("isolates corrupt ignored split decisions", () => {
  localStorage.setItem("stock_m:ignored-splits:v1", JSON.stringify([
    { sourceEventId: "alpaca:valid", symbol: "NVDA", note: "误报", ignoredAt: "2026-08-10T10:00:00Z" },
    { sourceEventId: "alpaca:bad", symbol: "NVDA", note: "", ignoredAt: "not-a-date" },
  ]));

  expect(new SplitDecisionRepository(localStorage).list()).toEqual([
    expect.objectContaining({ sourceEventId: "alpaca:valid" }),
  ]);
});
