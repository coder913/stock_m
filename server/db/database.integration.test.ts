// @vitest-environment node
import { afterAll, expect, test } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "./database";
import { checkMigrations, latestMigrationName, migrateToLatest } from "./migrate";

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test",
);

afterAll(async () => {
  await database.destroy();
});

test("migrates the platform schema against postgres", async () => {
  await migrateToLatest(database);

  const schemas = await sql<{ schemaName: string }>`
    select schema_name from information_schema.schemata
  `.execute(database);

  expect(schemas.rows.map((row) => row.schemaName)).toEqual(
    expect.arrayContaining(["platform", "core", "monitor", "market", "broker"]),
  );
  const quantityColumns = await sql<{ tableName: string; numericScale: number }>`
    select table_name, numeric_scale
    from information_schema.columns
    where table_schema = 'broker'
      and column_name = 'quantity'
    order by table_name
  `.execute(database);
  expect(quantityColumns.rows).toEqual([
    { tableName: "activity", numericScale: 9 },
    { tableName: "fill", numericScale: 9 },
    { tableName: "ledger_event", numericScale: 9 },
    { tableName: "order_intent", numericScale: 9 },
    { tableName: "position_snapshot", numericScale: 9 },
  ]);
  expect(await checkMigrations(database)).toEqual({ current: latestMigrationName, latest: latestMigrationName, upToDate: true });
});
