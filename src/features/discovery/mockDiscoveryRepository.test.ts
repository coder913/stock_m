import { expect, test } from "vitest";
import { mockDiscoveryRepository } from "./mockDiscoveryRepository";

test("returns source and freshness with discovery data", async () => {
  const result = await mockDiscoveryRepository.listStocks();

  expect(result.freshness).toEqual({ kind: "delayed", minutes: 15 });
  expect(result.source).toBe("stock_m demo dataset");
  expect(result.items.map((item) => item.symbol)).toContain("NVDA");
});

test("returns cloned discovery data", async () => {
  const first = await mockDiscoveryRepository.listStocks();
  first.items[0].name = "changed";

  const second = await mockDiscoveryRepository.listStocks();
  expect(second.items[0].name).not.toBe("changed");
});
