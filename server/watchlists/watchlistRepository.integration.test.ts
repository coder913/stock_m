// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { PostgresWatchlistRepository } from "./watchlistRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new PostgresWatchlistRepository(database);

beforeAll(() => migrateToLatest(database));
beforeEach(async () => {
  await database.deleteFrom("core.watchlist_symbol").execute();
  await database.deleteFrom("core.watchlist_group").execute();
});
afterAll(() => database.destroy());

test("normalizes and deduplicates symbols while preserving soft-deleted memberships", async () => {
  const group = await repository.createGroup("AI Infrastructure");
  await repository.addSymbol(group.id, "nvda");
  await repository.addSymbol(group.id, "NVDA");

  expect((await repository.list())[0]).toMatchObject({ name: "AI Infrastructure", symbols: ["NVDA"], order: 0 });
  await repository.removeGroup(group.id);
  expect(await repository.list()).toEqual([]);
  expect(await repository.listDeleted()).toHaveLength(1);
  await repository.restoreGroup(group.id);
  expect((await repository.list())[0].symbols).toEqual(["NVDA"]);
});

test("orders active groups and rejects a stale rename", async () => {
  const first = await repository.createGroup("Growth");
  const second = await repository.createGroup("Value");
  await repository.moveGroup(second.id, 0);
  expect((await repository.list()).map((group) => group.name)).toEqual(["Value", "Growth"]);

  const renamed = await repository.renameGroup(first.id, "Compounders", first.version);
  expect(renamed.version).toBe(first.version + 1);
  await expect(repository.renameGroup(first.id, "Stale", first.version)).rejects.toMatchObject({
    code: "VERSION_CONFLICT",
    statusCode: 409,
    details: { latest: { name: "Compounders", version: first.version + 1 } },
  });
});
