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
