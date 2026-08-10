import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table platform.worker_heartbeat (
      worker text primary key check (worker in ('monitor', 'notifications')),
      state text not null check (state in ('starting', 'ready', 'degraded', 'stopping')),
      queue_lag integer not null check (queue_lag >= 0),
      heartbeat_at timestamptz not null
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists platform.worker_heartbeat`.execute(database);
}
