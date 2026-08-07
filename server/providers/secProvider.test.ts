// @vitest-environment node
import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SecProvider } from "./secProvider";

const fixture = (name: string) => readFileSync(new URL(`../testing/fixtures/${name}`, import.meta.url), "utf8");

test("retains SEC provenance for normalized revenue facts", async () => {
  const fetcher = vi.fn(async (url: string) => new Response(url.includes("companyfacts") ? fixture("sec-nvda-companyfacts.json") : url.includes("submissions") ? fixture("sec-nvda-submissions.json") : fixture("sec-company-tickers.json")));
  const provider = new SecProvider("stock_m owner@example.com", fetcher);

  const facts = await provider.getFinancialFacts("NVDA");

  expect(facts.data[0]).toMatchObject({ symbol: "NVDA", statement: "income", concept: "RevenueFromContractWithCustomerExcludingAssessedTax", label: "营业收入", unit: "USD", form: "10-K", accessionNumber: "0001045810-26-000042" });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("data.sec.gov"), expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": "stock_m owner@example.com" }) }));
});

test("returns supported filings newest first with SEC source links", async () => {
  const fetcher = async (url: string) => new Response(url.includes("submissions") ? fixture("sec-nvda-submissions.json") : fixture("sec-company-tickers.json"));
  const provider = new SecProvider("stock_m owner@example.com", fetcher);

  const filings = await provider.getFilings("NVDA");

  expect(filings.data.map((filing) => filing.form)).toEqual(["8-K", "10-Q", "10-K"]);
  expect(filings.data[0].url).toContain("000104581026000040");
});
