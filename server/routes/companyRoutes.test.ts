// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { buildApp } from "../app";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { RefreshRegistry } from "../core/refreshRegistry";

let cache: SqliteMarketDataCache | undefined;
afterEach(() => cache?.close());

test("serves normalized financial facts and filings through cached company routes", async () => {
  cache = new SqliteMarketDataCache(":memory:");
  const app = buildApp({
    config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } },
    cache,
    refreshRegistry: new RefreshRegistry(),
    company: {
      gateway: new MarketDataGateway({ cache, now: () => "2026-08-07T14:00:00Z" }),
      sec: {
        getFinancialFacts: async () => ({ source: "sec" as const, asOf: "2026-03-01", data: [{ symbol: "NVDA", statement: "income" as const, concept: "RevenueFromContractWithCustomerExcludingAssessedTax", label: "营业收入", value: 130500000000, unit: "USD", periodEnd: "2026-01-31", form: "10-K", filedAt: "2026-03-01", accessionNumber: "0001045810-26-000042" }] }),
        getFilings: async () => ({ source: "sec" as const, asOf: "2026-08-01", data: [{ symbol: "NVDA", form: "8-K" as const, filedAt: "2026-08-01", accessionNumber: "0001045810-26-000040", primaryDocument: "nvda.htm", url: "https://www.sec.gov/example" }] }),
      },
    },
  });

  const [financials, filings] = await Promise.all([
    app.inject({ url: "/api/companies/NVDA/financials" }),
    app.inject({ url: "/api/companies/NVDA/filings" }),
  ]);

  expect(financials.json().data[0]).toMatchObject({ concept: "RevenueFromContractWithCustomerExcludingAssessedTax", unit: "USD" });
  expect(filings.json().data[0]).toMatchObject({ form: "8-K", accessionNumber: "0001045810-26-000040" });
  await app.close();
});
