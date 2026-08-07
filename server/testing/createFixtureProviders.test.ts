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
