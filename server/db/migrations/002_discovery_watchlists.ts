import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table core.user_universe_revision (
      id text primary key,
      version integer not null default 0 check (version >= 0)
    );
    insert into core.user_universe_revision (id, version) values ('local-single-user', 0);

    create table core.user_universe_symbol (
      symbol text primary key,
      kind text not null check (kind in ('added', 'removed_default')),
      created_at timestamptz not null default now(),
      check (symbol ~ '^[A-Z0-9.-]+$')
    );

    create table core.saved_screen (
      id text primary key,
      ordinal bigserial not null unique,
      name text not null check (length(btrim(name)) > 0),
      conditions_json jsonb not null,
      sort_metric text not null,
      sort_direction text not null check (sort_direction in ('asc', 'desc')),
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    );

    create table core.watchlist_group (
      id text primary key,
      name text not null check (length(btrim(name)) > 0),
      order_index numeric(20, 8) not null,
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    );
    create index watchlist_group_active_order_idx on core.watchlist_group (order_index, id) where deleted_at is null;

    create table core.watchlist_symbol (
      group_id text not null references core.watchlist_group(id) on delete cascade,
      symbol text not null check (symbol ~ '^[A-Z0-9.-]+$'),
      order_index numeric(20, 8) not null,
      created_at timestamptz not null,
      primary key (group_id, symbol)
    );
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists core.watchlist_symbol;
    drop table if exists core.watchlist_group;
    drop table if exists core.saved_screen;
    drop table if exists core.user_universe_symbol;
    drop table if exists core.user_universe_revision;
  `.execute(database);
}
