// @vitest-environment node
import { expect, test } from "vitest";
import { ProviderRateLimitError } from "../core/errors";
import { createFixtureProviders } from "./createFixtureProviders";

test("serves deterministic normalized data through production provider contracts", async () => {
  const fixtures = createFixtureProviders();
  const [quotes, profile, filings, events, macro] = await Promise.all([
    fixtures.alpaca.getQuotes(["NVDA"]),
    fixtures.finnhub.getCompanyProfile("NVDA"),
    fixtures.sec.getFilings("NVDA"),
    fixtures.finnhub.getEarnings("2026-08-01", "2026-08-31", ["NVDA"]),
    fixtures.fred.getSeries(["CPIAUCSL"]),
  ]);

  expect(quotes.data[0]).toMatchObject({ symbol: "NVDA", price: 167.32 });
  expect(profile.data).toMatchObject({ symbol: "NVDA", name: "NVIDIA Corp" });
  expect(filings.data[0]).toMatchObject({ form: "10-K" });
  expect(events.data[0]).toMatchObject({ type: "earnings" });
  expect(macro.data[0]).toMatchObject({ seriesId: "CPIAUCSL" });
});

test("fails only the next matching provider request", async () => {
  const fixtures = createFixtureProviders();
  fixtures.failNext("alpaca", 429);

  await expect(fixtures.alpaca.getQuotes(["NVDA"])).rejects.toBeInstanceOf(
    ProviderRateLimitError,
  );
  await expect(fixtures.alpaca.getQuotes(["NVDA"])).resolves.toMatchObject({
    data: [{ symbol: "NVDA", price: 167.32 }],
  });
});

test("changes the next fixture quote without changing other symbols", async () => {
  const fixtures = createFixtureProviders();
  fixtures.setQuote("NVDA", 190, 167.32);
  const quotes = await fixtures.alpaca.getQuotes(["NVDA", "MSFT"]);

  expect(quotes.data[0]).toMatchObject({ symbol: "NVDA", price: 190, previousClose: 167.32 });
  expect(quotes.data[1]).toMatchObject({ symbol: "MSFT", price: 505.41 });
});

test("serves raw and adjusted performance history for every requested symbol", async () => {
  const fixtures = createFixtureProviders();

  const raw = await fixtures.alpaca.getBatchBars(["NVDA", "SPY"], {
    timeframe: "1Day",
    start: "2026-08-04",
    end: "2026-08-07",
    adjustment: "raw",
  });
  const adjusted = await fixtures.alpaca.getBatchBars(["NVDA", "SPY"], {
    timeframe: "1Day",
    start: "2026-08-04",
    end: "2026-08-07",
    adjustment: "all",
  });

  expect(raw.data.symbols.NVDA.map((bar) => bar.close)).toEqual([100, 105, 52.5, 55]);
  expect(raw.data.symbols.NVDA.every((bar) => !bar.adjusted)).toBe(true);
  expect(adjusted.data.symbols.SPY).toHaveLength(4);
  expect(adjusted.data.symbols.SPY.every((bar) => bar.adjusted)).toBe(true);
});

test("serves a deterministic split candidate and fails only one batch request", async () => {
  const fixtures = createFixtureProviders();
  const actions = await fixtures.alpaca.getCorporateActions(
    ["NVDA"],
    "2026-08-04",
    "2026-08-07",
  );
  expect(actions.data).toEqual([
    expect.objectContaining({
      id: "alpaca:action:nvda-split",
      type: "split",
      split: expect.objectContaining({ quantityMultiplier: 2 }),
    }),
  ]);

  fixtures.failNext("alpaca", 429);
  await expect(fixtures.alpaca.getBatchBars(["NVDA"], {
    timeframe: "1Day",
    start: "2026-08-04",
    end: "2026-08-07",
    adjustment: "raw",
  })).rejects.toBeInstanceOf(ProviderRateLimitError);
  await expect(fixtures.alpaca.getBatchBars(["NVDA"], {
    timeframe: "1Day",
    start: "2026-08-04",
    end: "2026-08-07",
    adjustment: "raw",
  })).resolves.toMatchObject({ data: { symbols: { NVDA: expect.any(Array) } } });
});
