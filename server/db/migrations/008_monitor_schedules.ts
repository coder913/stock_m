import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table monitor.schedule_state (
      run_type text primary key check (run_type in ('price', 'financial', 'event')),
      last_success_natural_period text not null,
      last_success_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table monitor.run (
      id uuid primary key,
      run_type text not null check (run_type in ('price', 'financial', 'event')),
      natural_period text not null,
      scheduled_for timestamptz not null,
      catch_up boolean not null,
      status text not null check (status in ('claimed', 'running', 'succeeded', 'failed')),
      data_state text check (data_state in ('fresh', 'stale', 'unavailable')),
      diagnostics_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null,
      started_at timestamptz,
      finished_at timestamptz,
      unique (run_type, natural_period)
    );
    create index monitor_run_status_scheduled_idx on monitor.run(status, scheduled_for desc);
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists monitor.run`.execute(database);
  await sql`drop table if exists monitor.schedule_state`.execute(database);
}
