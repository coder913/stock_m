// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresManualPortfolioRepository } from "./manualPortfolioRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresManualPortfolioRepository(database, () => new Date("2026-08-10T10:00:00Z"));
beforeAll(() => migrateToLatest(database));
beforeEach(async () => { await database.deleteFrom("core.manual_portfolio_ledger_event").execute(); await database.updateTable("core.manual_portfolio").set({ revision: 0 }).execute(); });
afterAll(() => database.destroy());

test("keeps exact eight-decimal values and rejects oversells and excess withdrawals", async () => {
  await repository.append({ type: "buy", symbol: "NVDA", quantity: 1.12345678, price: 100.12345678, thesisVersionId: "thesis-1", occurredAt: "2026-08-10T09:00:00Z" });
  expect((await repository.listLedger())[0]).toMatchObject({ quantity: 1.12345678, price: 100.12345678 });
  await expect(repository.append({ type: "sell", symbol: "NVDA", quantity: 2, price: 110, reason: "trim", occurredAt: "2026-08-10T09:01:00Z" })).rejects.toMatchObject({ code: "INSUFFICIENT_QUANTITY" });
  await expect(repository.append({ type: "withdrawal", amount: 20_000, reason: "cash out", occurredAt: "2026-08-10T09:02:00Z" })).rejects.toMatchObject({ code: "INSUFFICIENT_CASH" });
});

test("deduplicates split events by source event id", async () => {
  const split = { type: "split" as const, symbol: "NVDA", oldRate: 1, newRate: 10, quantityMultiplier: 10, source: "alpaca" as const, sourceEventId: "alpaca-split-1", confirmedAt: "2026-08-10T09:00:00Z", occurredAt: "2026-08-10T00:00:00Z" };
  expect(await repository.append(split)).toEqual(await repository.append(split));
  expect(await repository.listLedger()).toHaveLength(1);
});

test("returns PostgreSQL date settings as YYYY-MM-DD values", async () => {
  const settings = await repository.saveSettings({
    initialCash: 1_000,
    inceptionDate: "2026-08-04",
    benchmarkSymbol: "SPY",
    baseCurrency: "USD",
  });

  expect(settings.inceptionDate).toBe("2026-08-04");
  expect((await repository.getBootstrap()).settings.inceptionDate).toBe("2026-08-04");
});
