import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create schema if not exists broker;

    create table broker.account (
      id text primary key,
      status text not null,
      currency text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table broker.account_snapshot (
      id uuid primary key,
      account_id text not null,
      cash numeric(28,8) not null,
      buying_power numeric(28,8) not null,
      equity numeric(28,8) not null,
      portfolio_value numeric(28,8) not null,
      trading_blocked boolean not null,
      account_blocked boolean not null,
      observed_at timestamptz not null
    );
    create index broker_account_snapshot_observed_idx on broker.account_snapshot(observed_at desc);

    create table broker.order_preview_audit (
      id uuid primary key,
      input_hash text not null,
      normalized_order_json jsonb not null,
      expires_at timestamptz not null,
      created_at timestamptz not null
    );
    create table broker.order_intent (
      id uuid primary key,
      preview_id uuid not null,
      client_order_id text not null unique,
      symbol text not null,
      side text not null check (side in ('buy', 'sell')),
      quantity numeric(28,8) not null check (quantity > 0),
      order_type text not null check (order_type in ('market', 'limit')),
      time_in_force text not null check (time_in_force in ('day', 'gtc')),
      limit_price numeric(28,8),
      confirmed_at timestamptz not null
    );
    create table broker.cancel_intent (
      id uuid primary key,
      order_intent_id uuid not null references broker.order_intent(id),
      created_at timestamptz not null
    );
    create table broker.remote_order (
      remote_order_id text primary key,
      order_intent_id uuid not null unique references broker.order_intent(id),
      raw_json jsonb not null,
      first_observed_at timestamptz not null,
      last_observed_at timestamptz not null
    );
    create table broker.order_event (
      id uuid primary key,
      order_intent_id uuid not null references broker.order_intent(id),
      remote_event_id text unique,
      event text not null,
      payload_json jsonb not null,
      occurred_at timestamptz not null,
      created_at timestamptz not null
    );
    create index broker_order_event_timeline_idx on broker.order_event(order_intent_id, occurred_at, id);
    create table broker.order_projection (
      order_intent_id uuid primary key references broker.order_intent(id),
      state text not null,
      version integer not null default 0 check (version >= 0),
      updated_at timestamptz not null
    );

    create table broker.fill (
      remote_fill_id text primary key,
      remote_order_id text not null,
      symbol text not null,
      side text not null check (side in ('buy', 'sell')),
      quantity numeric(28,8) not null,
      price numeric(28,8) not null,
      occurred_at timestamptz not null,
      raw_json jsonb not null
    );
    create table broker.activity (
      remote_activity_id text primary key,
      activity_type text not null,
      symbol text,
      amount numeric(28,8),
      quantity numeric(28,8),
      price numeric(28,8),
      occurred_at timestamptz not null,
      raw_json jsonb not null
    );
    create table broker.ledger_event (
      id uuid primary key,
      remote_source_id text not null unique,
      event_type text not null,
      symbol text,
      quantity numeric(28,8),
      price numeric(28,8),
      amount numeric(28,8),
      occurred_at timestamptz not null,
      provenance_json jsonb not null
    );
    create table broker.reconciliation_run (
      id uuid primary key,
      status text not null check (status in ('running', 'succeeded', 'failed')),
      diagnostics_json jsonb not null,
      started_at timestamptz not null,
      finished_at timestamptz
    );
    create table broker.drift (
      id uuid primary key,
      reconciliation_run_id uuid not null references broker.reconciliation_run(id),
      cash_difference numeric(28,8),
      symbol_differences_json jsonb not null,
      detected_at timestamptz not null,
      cleared_at timestamptz
    );
    create index broker_active_drift_idx on broker.drift(detected_at desc) where cleared_at is null;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop schema if exists broker cascade`.execute(database);
}
