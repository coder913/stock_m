import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create schema if not exists platform;
    create schema if not exists core;
    create schema if not exists monitor;
    create schema if not exists market;

    create table if not exists platform.schema_migration (
      name text primary key,
      applied_at timestamptz not null default now()
    );

    create table if not exists platform.idempotency_record (
      key text primary key,
      fingerprint text not null,
      status_code integer not null,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );

    create table if not exists platform.outbox_event (
      id text primary key,
      topic text not null,
      aggregate_id text not null,
      payload_json jsonb not null,
      occurred_at timestamptz not null,
      published_at timestamptz,
      attempts integer not null default 0 check (attempts >= 0)
    );

    create index if not exists outbox_event_unpublished_idx
      on platform.outbox_event (occurred_at, id)
      where published_at is null;

    create table if not exists platform.inbox_event (
      consumer text not null,
      event_id text not null,
      consumed_at timestamptz not null default now(),
      primary key (consumer, event_id)
    );

    create table if not exists platform.dead_letter (
      id text primary key,
      consumer text not null,
      event_id text not null,
      reason text not null,
      payload_json jsonb not null,
      created_at timestamptz not null default now()
    );

    create table if not exists platform.installation (
      id text primary key,
      created_at timestamptz not null default now()
    );

    insert into platform.installation (id)
    values ('local-single-user')
    on conflict (id) do nothing;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop schema if exists market cascade;
    drop schema if exists monitor cascade;
    drop schema if exists core cascade;
    drop schema if exists platform cascade;
  `.execute(database);
}
