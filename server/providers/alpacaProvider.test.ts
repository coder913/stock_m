// @vitest-environment node
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { AlpacaProvider } from "./alpacaProvider";

const fixtureFetch = (file: string) => async () => new Response(readFileSync(new URL(`../testing/fixtures/${file}`, import.meta.url), "utf8"), { status: 200 });

test("normalizes delayed SIP snapshots without claiming realtime", async () => {
  const provider = new AlpacaProvider({ keyId: "id", secretKey: "secret" }, fixtureFetch("alpaca-snapshots.json"));

  const result = await provider.getQuotes(["nvda", "AAPL"], "delayed_sip");

  expect(result.source).toBe("alpaca");
  expect(result.delayMinutes).toBe(15);
  expect(result.data[0]).toMatchObject({ symbol: "NVDA", price: 167.32, previousClose: 162.58, currency: "USD", marketSession: "regular" });
});

test("keeps price undefined when a snapshot has no latest trade", async () => {
  const provider = new AlpacaProvider({ keyId: "id", secretKey: "secret" }, fixtureFetch("alpaca-snapshots-missing-trade.json"));

  expect((await provider.getQuotes(["XOM"], "iex")).data[0].price).toBeUndefined();
});

test("loads every batch-bars page and forwards adjustment", async () => {
  const urls: string[] = [];
  const fetcher = async (input: string) => {
    const url = String(input);
    urls.push(url);
    const file = url.includes("page_token=page-2")
      ? "alpaca-batch-bars-page-2.json"
      : "alpaca-batch-bars-page-1.json";
    return new Response(
      readFileSync(new URL(`../testing/fixtures/${file}`, import.meta.url), "utf8"),
      { status: 200 },
    );
  };
  const provider = new AlpacaProvider(
    { keyId: "id", secretKey: "secret" },
    fetcher,
  );

  const result = await provider.getBatchBars(["nvda", "MSFT", "NVDA"], {
    timeframe: "1Day",
    start: "2026-08-01",
    end: "2026-08-10",
    adjustment: "all",
    feed: "delayed_sip",
  });

  expect(urls[0]).toContain("symbols=NVDA%2CMSFT");
  expect(urls[0]).toContain("adjustment=all");
  expect(urls[1]).toContain("page_token=page-2");
  expect(result.data.symbols.NVDA[0]).toMatchObject({ close: 167, adjusted: true });
  expect(result.data.symbols.MSFT[0]).toMatchObject({ close: 505, adjusted: true });
  expect(result.data.missingSymbols).toEqual([]);
});
