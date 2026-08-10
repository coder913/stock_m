import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create schema if not exists market;

    create table market.cache_entry (
      cache_key text primary key,
      source text not null,
      payload_json jsonb not null,
      as_of timestamptz not null,
      fetched_at timestamptz not null,
      expires_at timestamptz not null,
      delay_minutes integer,
      notices_json jsonb not null default '[]'::jsonb
    );

    create table market.provider_state (
      source text primary key,
      cooldown_until timestamptz,
      last_success_at timestamptz,
      last_error_code text
    );

    create table market.refresh_attempt (
      id bigint generated always as identity primary key,
      cache_key text not null,
      source text not null,
      status text not null check (status in ('success', 'error')),
      error_code text,
      attempted_at timestamptz not null
    );
    create index refresh_attempt_source_time_idx on market.refresh_attempt(source, attempted_at desc);
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop schema if exists market cascade`.execute(database);
}
