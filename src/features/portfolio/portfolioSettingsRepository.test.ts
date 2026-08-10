import { beforeEach, expect, test } from "vitest";
import type { LedgerEvent } from "./domain";
import { PortfolioSettingsRepository } from "./portfolioSettingsRepository";

beforeEach(() => localStorage.clear());

test("migrates existing ledger settings once", () => {
  const events = [{
    id: "buy-1",
    type: "buy",
    symbol: "NVDA",
    quantity: 1,
    price: 100,
    thesisVersionId: "t1",
    occurredAt: "2026-08-04T15:00:00Z",
  }] satisfies LedgerEvent[];
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
  );

  expect(repo.migrate(events)).toMatchObject({
    version: 1,
    initialCash: 10_000,
    inceptionDate: "2026-08-04",
    benchmarkSymbol: "SPY",
    baseCurrency: "USD",
  });
  expect(repo.migrate([])).toEqual(repo.get());
});

test("normalizes and saves valid settings", () => {
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
    () => "2026-08-04",
  );

  expect(repo.save({
    initialCash: 5_000,
    inceptionDate: "2026-08-04",
    benchmarkSymbol: "qqq",
    baseCurrency: "USD",
  })).toEqual({
    version: 1,
    initialCash: 5_000,
    inceptionDate: "2026-08-04",
    benchmarkSymbol: "QQQ",
    baseCurrency: "USD",
    updatedAt: "2026-08-10T00:00:00Z",
  });
});

test.each([
  ["negative cash", { initialCash: -1, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD" }],
  ["NaN cash", { initialCash: Number.NaN, inceptionDate: "2026-08-04", benchmarkSymbol: "SPY", baseCurrency: "USD" }],
  ["invalid date", { initialCash: 1000, inceptionDate: "2026-02-30", benchmarkSymbol: "SPY", baseCurrency: "USD" }],
  ["future date", { initialCash: 1000, inceptionDate: "2026-08-11", benchmarkSymbol: "SPY", baseCurrency: "USD" }],
  ["invalid benchmark", { initialCash: 1000, inceptionDate: "2026-08-04", benchmarkSymbol: "S PY", baseCurrency: "USD" }],
] as const)("rejects invalid settings: %s", (_name, input) => {
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
  );
  expect(() => repo.save(input)).toThrow();
});

test("rejects inception later than the earliest event", () => {
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
    () => "2026-08-04",
  );
  expect(() => repo.save({
    initialCash: 1000,
    inceptionDate: "2026-08-05",
    benchmarkSymbol: "SPY",
    baseCurrency: "USD",
  })).toThrow("最早账本事件");
});

test.each([
  ["malformed JSON", "{"],
  ["invalid structure", JSON.stringify({ version: 1, initialCash: "bad" })],
])("quarantines %s and recovers defaults", (_name, stored) => {
  localStorage.setItem("stock_m:portfolio-settings:v1", stored);
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
  );

  expect(repo.get()).toMatchObject({
    version: 1,
    initialCash: 10_000,
    inceptionDate: "2026-08-10",
    benchmarkSymbol: "SPY",
    baseCurrency: "USD",
  });
  expect(repo.getRecoveryNotice()).toContain("已恢复默认设置");
  expect(Object.keys(localStorage).some((key) => key.startsWith("stock_m:portfolio-settings:corrupt:"))).toBe(true);
});

test("uses the earliest ledger date when migration recovers corrupt settings", () => {
  localStorage.setItem("stock_m:portfolio-settings:v1", "{");
  const repo = new PortfolioSettingsRepository(
    localStorage,
    () => "2026-08-10T00:00:00Z",
  );
  const events = [{
    id: "buy-1",
    type: "buy",
    symbol: "NVDA",
    quantity: 1,
    price: 100,
    thesisVersionId: "t1",
    occurredAt: "2026-08-04T15:00:00Z",
  }] satisfies LedgerEvent[];

  expect(repo.migrate(events).inceptionDate).toBe("2026-08-04");
  expect(repo.getRecoveryNotice()).toContain("已恢复默认设置");
});
