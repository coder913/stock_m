import { expect, test } from "vitest";
import { mockMarketRepository } from "./mockMarketRepository";

test("returns an explainable delayed signal", async () => {
  const dashboard = await mockMarketRepository.getToday();

  expect(dashboard.asOf).toBe("2026-08-04T07:30:00-04:00");
  expect(dashboard.freshness).toEqual({ kind: "delayed", minutes: 15 });
  expect(dashboard.signals[0]).toMatchObject({ symbol: "NVDA" });
  expect(dashboard.signals[0].reasons).toHaveLength(3);
});

test("rejects an unknown instrument", async () => {
  await expect(mockMarketRepository.getInstrument("UNKNOWN"))
    .rejects.toThrow("未找到股票 UNKNOWN");
});
