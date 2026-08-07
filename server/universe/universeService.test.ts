// @vitest-environment node
import { expect, test, vi } from "vitest";
import { defaultUniverse } from "./defaultUniverse";
import { UniverseService } from "./universeService";
test("returns quote-first metrics while profile hydration is unavailable", async () => {
  const service = new UniverseService({ getQuotes: vi.fn(async () => ({ data: [{ symbol: "NVDA", price: 167.32, currency: "USD", marketSession: "regular" as const }] })), getCompanyProfile: vi.fn(async () => { throw new Error("pending"); }) }, () => "2026-08-07T00:00:00Z");
  const result = await service.getSnapshot(["NVDA"]);
  expect(result.items[0]).toMatchObject({ symbol: "NVDA", metrics: { price: 167.32 }, coverage: { status: "preparing" } });
});
test("defines an approximately one hundred unique symbol universe", () => { expect(defaultUniverse.length).toBeGreaterThanOrEqual(95); expect(defaultUniverse.length).toBeLessThanOrEqual(105); expect(new Set(defaultUniverse.map((item) => item.symbol)).size).toBe(defaultUniverse.length); });
