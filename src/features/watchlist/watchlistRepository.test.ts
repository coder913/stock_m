import { beforeEach, expect, test } from "vitest";
import { WatchlistRepository } from "./watchlistRepository";

beforeEach(() => localStorage.clear());

test("removing and restoring a group preserves memberships", () => {
  const repository = new WatchlistRepository(localStorage);
  const group = repository.createGroup("AI 基础设施");
  repository.addSymbol(group.id, "NVDA");
  repository.removeGroup(group.id);

  expect(repository.list()).toEqual([]);
  repository.restoreGroup(group.id);
  expect(repository.list()[0].symbols).toEqual(["NVDA"]);
});

test("allows a symbol in multiple ordered groups", () => {
  const repository = new WatchlistRepository(localStorage);
  const first = repository.createGroup("成长");
  const second = repository.createGroup("估值");
  repository.addSymbol(first.id, "NVDA");
  repository.addSymbol(second.id, "NVDA");
  repository.moveGroup(second.id, 0);

  expect(repository.list().map((group) => group.name)).toEqual(["估值", "成长"]);
  expect(repository.list().every((group) => group.symbols.includes("NVDA"))).toBe(true);
});
