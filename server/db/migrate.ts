import { pathToFileURL } from "node:url";
import { sql, type Kysely } from "kysely";
import { createDatabase } from "./database";
import type { Database } from "./types";
import * as platformMigration from "./migrations/001_platform";
import * as discoveryWatchlistsMigration from "./migrations/002_discovery_watchlists";
import * as thesisMonitoringMigration from "./migrations/003_thesis_monitoring";
import * as manualPortfolioMigration from "./migrations/004_manual_portfolio";
import * as browserMigration from "./migrations/005_browser_migration";
import * as marketCacheMigration from "./migrations/006_market_cache";

interface Migration {
  up(database: Kysely<unknown>): Promise<void>;
}

const migrations: ReadonlyArray<readonly [string, Migration]> = [
  ["001_platform", platformMigration],
  ["002_discovery_watchlists", discoveryWatchlistsMigration],
  ["003_thesis_monitoring", thesisMonitoringMigration],
  ["004_manual_portfolio", manualPortfolioMigration],
  ["005_browser_migration", browserMigration],
  ["006_market_cache", marketCacheMigration],
];

export async function migrateToLatest(database: Kysely<Database>): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await sql`select pg_advisory_xact_lock(19370101)`.execute(transaction);
    await sql`create schema if not exists platform`.execute(transaction);
    await sql`
      create table if not exists platform.schema_migration (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `.execute(transaction);

    const applied = await transaction
      .selectFrom("platform.schema_migration")
      .select("name")
      .execute();
    const appliedNames = new Set(applied.map(({ name }) => name));

    for (const [name, migration] of migrations) {
      if (appliedNames.has(name)) continue;
      await migration.up(transaction as unknown as Kysely<unknown>);
      await transaction
        .insertInto("platform.schema_migration")
        .values({ name, appliedAt: new Date() })
        .execute();
    }
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const database = createDatabase(connectionString);
  try {
    await migrateToLatest(database);
  } finally {
    await database.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
