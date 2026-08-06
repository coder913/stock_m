import { expect, test } from "vitest";
import { LocalPortfolioRepository } from "./localPortfolioRepository";

test("requires a thesis and calculates paper pnl", () => {
  localStorage.clear(); const repo = new LocalPortfolioRepository(localStorage);
  expect(() => repo.add({ symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "" })).toThrow("投资逻辑");
  repo.add({ symbol: "NVDA", quantity: 10, price: 100, thesisVersionId: "v1" });
  expect(repo.positions({ NVDA: 120 })[0]).toMatchObject({ marketValue: 1200, unrealizedPnl: 200 });
});
