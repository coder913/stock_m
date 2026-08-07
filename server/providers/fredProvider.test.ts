// @vitest-environment node
import { expect, test } from "vitest";
import { FredProvider } from "./fredProvider";

test("loads approved FRED release dates as all-day macro events", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    expect(url).toContain("/fred/releases/dates");
    expect(url).toContain("realtime_start=2026-08-01");
    expect(url).toContain("realtime_end=2026-08-31");
    return new Response(JSON.stringify({
      release_dates: [
        { release_id: 10, release_name: "Consumer Price Index", date: "2026-08-12" },
        { release_id: 53, release_name: "Gross Domestic Product", date: "2026-08-27" },
        { release_id: 999, release_name: "Unsupported Release", date: "2026-08-20" },
      ],
    }), { status: 200 });
  };
  const provider = new FredProvider("fred-key", fetcher);

  const result = await provider.getReleaseEvents("2026-08-01", "2026-08-31");

  expect(result.data).toEqual([
    {
      id: "fred:release:10:2026-08-12",
      type: "macro",
      title: "Consumer Price Index",
      scheduledAt: "2026-08-12",
      timing: "all-day",
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/releases/calendar",
    },
    {
      id: "fred:release:53:2026-08-27",
      type: "macro",
      title: "Gross Domestic Product",
      scheduledAt: "2026-08-27",
      timing: "all-day",
      source: "fred",
      sourceUrl: "https://fred.stlouisfed.org/releases/calendar",
    },
  ]);
});
