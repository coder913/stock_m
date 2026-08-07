// @vitest-environment node
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { FinnhubProvider } from "./finnhubProvider";

const fixtureFetch = (file: string) => async () => new Response(readFileSync(new URL(`../testing/fixtures/${file}`, import.meta.url), "utf8"));

test("normalizes a company profile and keeps absent description undefined", async () => {
  const provider = new FinnhubProvider("key", fixtureFetch("finnhub-nvda-profile.json"));
  const result = await provider.getCompanyProfile("nvda");
  expect(result.data).toMatchObject({ symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ NMS - GLOBAL MARKET", industry: "Semiconductors" });
  expect(result.data.description).toBeUndefined();
});

test("maps after-market earnings without inventing a clock time", async () => {
  const provider = new FinnhubProvider("key", fixtureFetch("finnhub-earnings-calendar.json"));
  const result = await provider.getEarnings("2026-08-01", "2026-08-31", ["NVDA"]);
  expect(result.data[0]).toMatchObject({ type: "earnings", symbol: "NVDA", timing: "after-market", scheduledAt: "2026-08-27" });
});
