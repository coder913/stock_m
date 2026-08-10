import { expect, test, vi } from "vitest";
import { MarketApiClient } from "./marketApiClient";

test("requests sorted unique batch bars with the selected adjustment", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    data: { symbols: {}, missingSymbols: [] },
    source: "alpaca",
    asOf: "2026-08-10T20:00:00Z",
    fetchedAt: "2026-08-10T20:01:00Z",
    expiresAt: "2026-08-10T20:16:00Z",
    stale: false,
    notices: [],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const client = new MarketApiClient(fetcher, "https://stock.test");

  await client.getBatchBars(["nvda", "MSFT", "NVDA"], {
    start: "2026-08-01",
    end: "2026-08-10",
    adjustment: "all",
  });

  expect(fetcher).toHaveBeenCalledWith(
    "https://stock.test/api/market/bars?symbols=MSFT%2CNVDA&timeframe=1Day&start=2026-08-01&end=2026-08-10&adjustment=all",
    undefined,
  );
});
