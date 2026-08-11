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
import * as workerHeartbeatsMigration from "./migrations/007_worker_heartbeats";
import * as monitorSchedulesMigration from "./migrations/008_monitor_schedules";
import * as pushSubscriptionsMigration from "./migrations/009_push_subscriptions";
import * as notificationDeliveriesMigration from "./migrations/010_notification_deliveries";
import * as brokerMigration from "./migrations/011_broker";
import * as tradingWorkerMigration from "./migrations/012_trading_worker";
import * as brokerPositionsMigration from "./migrations/013_broker_positions";
import * as brokerQuantityPrecisionMigration from "./migrations/014_broker_quantity_precision";

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
  ["007_worker_heartbeats", workerHeartbeatsMigration],
  ["008_monitor_schedules", monitorSchedulesMigration],
  ["009_push_subscriptions", pushSubscriptionsMigration],
  ["010_notification_deliveries", notificationDeliveriesMigration],
  ["011_broker", brokerMigration],
  ["012_trading_worker", tradingWorkerMigration],
  ["013_broker_positions", brokerPositionsMigration],
  ["014_broker_quantity_precision", brokerQuantityPrecisionMigration],
];
export const latestMigrationName = migrations.at(-1)![0];

export async function checkMigrations(database: Kysely<Database>): Promise<{ current: string; latest: string; upToDate: boolean }> {
  const current = await database.selectFrom("platform.schema_migration").select("name").orderBy("name", "desc").executeTakeFirst();
  return { current: current?.name ?? "none", latest: latestMigrationName, upToDate: current?.name === latestMigrationName };
}

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
    if (process.argv.includes("--check")) {
      const status = await checkMigrations(database);
      if (!status.upToDate) throw new Error(`Database migration mismatch: current=${status.current}, latest=${status.latest}`);
      process.stdout.write(`${status.current}\n`);
    } else await migrateToLatest(database);
  } finally {
    await database.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
