import { expect, test } from "vitest";
import { solveXirr } from "./xirr";

test("solves annual money-weighted return", () => {
  expect(solveXirr([
    { at: "2025-01-01T00:00:00Z", amount: -1000 },
    { at: "2026-01-01T00:00:00Z", amount: 1100 },
  ])).toBeCloseTo(0.100069657, 8);
});

test("returns undefined without both cash-flow signs", () => {
  expect(solveXirr([{ at: "2026-01-01T00:00:00Z", amount: 1000 }])).toBeUndefined();
});

test("returns undefined for invalid dates and non-finite amounts", () => {
  expect(solveXirr([{ at: "bad", amount: -1000 }, { at: "2026-01-01", amount: 1100 }])).toBeUndefined();
  expect(solveXirr([{ at: "2025-01-01", amount: -1000 }, { at: "2026-01-01", amount: Number.NaN }])).toBeUndefined();
});
