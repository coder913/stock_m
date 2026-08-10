import { sql, type Kysely } from "kysely";
export async function up(database: Kysely<unknown>): Promise<void> { await sql`
  create table core.manual_portfolio (id text primary key, revision integer not null default 0 check (revision >= 0));
  insert into core.manual_portfolio(id, revision) values ('default', 0);
  create table core.manual_portfolio_settings (portfolio_id text primary key references core.manual_portfolio(id), initial_cash numeric(28,8) not null, inception_date date not null, benchmark_symbol text not null, base_currency text not null check (base_currency='USD'), version integer not null, updated_at timestamptz not null);
  insert into core.manual_portfolio_settings values ('default', 10000, current_date, 'SPY', 'USD', 1, now());
  create table core.manual_portfolio_ledger_event (
    id text primary key, ordinal bigserial not null unique, portfolio_id text not null references core.manual_portfolio(id), type text not null check(type in ('buy','sell','dividend','fee','deposit','withdrawal','split')), symbol text, occurred_at timestamptz not null,
    quantity numeric(28,8), price numeric(28,8), amount numeric(28,8), thesis_version_id text, reason text, old_rate numeric(28,8), new_rate numeric(28,8), quantity_multiplier numeric(28,8), source text, source_event_id text unique, confirmed_at timestamptz
  );
  create table core.manual_portfolio_ignored_split (source_event_id text primary key, portfolio_id text not null references core.manual_portfolio(id), symbol text not null, note text not null, ignored_at timestamptz not null);
  create table core.portfolio_alert (id text primary key, portfolio_id text not null references core.manual_portfolio(id), dedupe_key text not null unique, rule text not null, severity text not null, symbol text, message text not null, current_value_json jsonb not null, threshold_json jsonb not null, created_at timestamptz not null);
  create table core.portfolio_alert_action (id text primary key, ordinal bigserial not null unique, alert_id text not null references core.portfolio_alert(id), type text not null, until_at timestamptz, created_at timestamptz not null);
  create table core.portfolio_snapshot (id text primary key, portfolio_id text not null references core.manual_portfolio(id), as_of timestamptz not null, snapshot_json jsonb not null, created_at timestamptz not null);
  create table core.portfolio_weekly_review (id text primary key, portfolio_id text not null references core.manual_portfolio(id), week text not null, version integer not null, snapshot_id text not null references core.portfolio_snapshot(id), judgment text not null, action text not null, result text not null, next_observations_json jsonb not null, trade_count integer not null, open_alert_count integer not null, created_at timestamptz not null, unique(week, version));
`.execute(database); }
export async function down(database: Kysely<unknown>): Promise<void> { await sql`drop table if exists core.portfolio_weekly_review; drop table if exists core.portfolio_snapshot; drop table if exists core.portfolio_alert_action; drop table if exists core.portfolio_alert; drop table if exists core.manual_portfolio_ignored_split; drop table if exists core.manual_portfolio_ledger_event; drop table if exists core.manual_portfolio_settings; drop table if exists core.manual_portfolio;`.execute(database); }
