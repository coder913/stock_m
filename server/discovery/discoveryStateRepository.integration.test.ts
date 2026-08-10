// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresDiscoveryStateRepository } from "./discoveryStateRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresDiscoveryStateRepository(database);

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("core.saved_screen").execute();
  await database.deleteFrom("core.user_universe_symbol").execute();
  await database.updateTable("core.user_universe_revision").set({ version: 0 }).execute();
});
afterAll(() => database.destroy());

test("normalizes user universe symbols and advances one optimistic version", async () => {
  const first = await repository.addUniverseSymbol("xom", 0);
  expect(first).toEqual({ addedSymbols: ["XOM"], removedDefaultSymbols: [], version: 1 });
  const duplicate = await repository.addUniverseSymbol("XOM", 1);
  expect(duplicate).toEqual({ addedSymbols: ["XOM"], removedDefaultSymbols: [], version: 2 });
  await expect(repository.removeUniverseSymbol("AAPL", 1)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});

test("creates independent saved screens and rejects stale updates", async () => {
  const saved = await repository.createScreen({
    name: "Growth",
    conditions: [{ id: "growth", metric: "revenueGrowthYoY", operator: ">=", value: 20, period: "TTM" }],
    sort: { metric: "revenueGrowthYoY", direction: "desc" },
  });
  const duplicate = await repository.duplicateScreen(saved.id);
  expect(duplicate.id).not.toBe(saved.id);
  expect((await repository.listScreens()).map((screen) => screen.name)).toEqual(["Growth", "Growth副本"]);

  const renamed = await repository.renameScreen(saved.id, "Quality Growth", saved.version);
  expect(renamed).toMatchObject({ name: "Quality Growth", version: 2 });
  await expect(repository.renameScreen(saved.id, "Stale", saved.version)).rejects.toMatchObject({
    code: "VERSION_CONFLICT",
    statusCode: 409,
    details: { latest: { name: "Quality Growth", version: 2 } },
  });
});
