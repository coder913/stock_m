import { beforeEach, expect, test } from "vitest";
import type { ScreenerCondition } from "./domain";
import { SavedScreenRepository } from "./savedScreenRepository";

const conditions: ScreenerCondition[] = [
  { id: "growth", metric: "revenueGrowthYoY", operator: ">=", value: 20, period: "TTM" },
];

beforeEach(() => localStorage.clear());

test("saves independent screen definitions", () => {
  const repository = new SavedScreenRepository(localStorage);
  const saved = repository.save({ name: "成长", conditions, sort: { metric: "revenueGrowthYoY", direction: "desc" } });
  const copy = repository.duplicate(saved.id);
  repository.rename(copy.id, "成长副本");

  conditions[0].value = 999;
  expect(repository.list().map((item) => item.name)).toEqual(["成长", "成长副本"]);
  expect(repository.list()[0].conditions[0].value).toBe(20);
});

test("removes only the requested screen", () => {
  const repository = new SavedScreenRepository(localStorage);
  const first = repository.save({ name: "一", conditions, sort: { metric: "price", direction: "asc" } });
  repository.save({ name: "二", conditions, sort: { metric: "price", direction: "asc" } });

  repository.remove(first.id);

  expect(repository.list().map((item) => item.name)).toEqual(["二"]);
});
