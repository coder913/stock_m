// @vitest-environment node
import { afterAll, expect, test } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "./database";
import { migrateToLatest } from "./migrate";

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
    expect.arrayContaining(["platform", "core", "monitor", "market"]),
  );
});
