import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table core.thesis_version (
      id text primary key,
      symbol text not null check (symbol ~ '^[A-Z0-9.-]+$'),
      version integer not null check (version > 0),
      core_judgment text not null,
      evidence_json jsonb not null,
      risks_json jsonb not null,
      validation_conditions_json jsonb not null,
      created_at timestamptz not null,
      unique (symbol, version)
    );
    create index thesis_version_symbol_latest_idx on core.thesis_version (symbol, version desc);

    create table core.thesis_condition (
      id text primary key,
      thesis_version_id text not null references core.thesis_version(id),
      symbol text not null,
      kind text not null check (kind in ('metric', 'event')),
      name text not null,
      direction text not null check (direction in ('support', 'risk')),
      severity text not null check (severity in ('low', 'medium', 'high')),
      deadline date,
      note text,
      spec_json jsonb not null,
      condition_version text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    );
    create index thesis_condition_active_idx on core.thesis_condition (symbol, thesis_version_id) where deleted_at is null;

    create table monitor.condition_evaluation (
      id text primary key,
      condition_id text not null,
      condition_version text not null,
      dedupe_key text not null unique,
      status text not null check (status in ('pending', 'confirmed', 'breached', 'expired')),
      data_state text not null check (data_state in ('fresh', 'missing', 'stale', 'unavailable')),
      actual_value_json jsonb,
      target_value_json jsonb,
      source text,
      as_of timestamptz,
      explanation text not null,
      evaluated_at timestamptz not null,
      changed boolean not null,
      previous_status text,
      unique (condition_id, condition_version, data_state, status, as_of)
    );
    create index condition_evaluation_timeline_idx on monitor.condition_evaluation (condition_id, evaluated_at);

    create table monitor.alert (
      id text primary key,
      dedupe_key text not null unique,
      symbol text not null,
      thesis_version_id text not null,
      condition_id text not null,
      condition_version text not null,
      from_status text,
      to_status text not null,
      severity text not null,
      title text not null,
      explanation text not null,
      as_of timestamptz,
      created_at timestamptz not null
    );
    create index alert_queue_idx on monitor.alert (symbol, severity, created_at desc);

    create table monitor.alert_action (
      id text primary key,
      ordinal bigserial not null unique,
      alert_id text not null references monitor.alert(id),
      type text not null check (type in ('read', 'snooze', 'archive', 'restore')),
      until_at timestamptz,
      created_at timestamptz not null
    );
    create index alert_action_timeline_idx on monitor.alert_action (alert_id, ordinal);

    create table monitor.thesis_review (
      id text primary key,
      thesis_version_id text not null,
      symbol text not null,
      decision text not null check (decision in ('reaffirmed', 'invalidated', 'archived')),
      note text,
      condition_snapshot_json jsonb not null,
      created_at timestamptz not null
    );
    create index thesis_review_timeline_idx on monitor.thesis_review (thesis_version_id, created_at);
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists monitor.thesis_review;
    drop table if exists monitor.alert_action;
    drop table if exists monitor.alert;
    drop table if exists monitor.condition_evaluation;
    drop table if exists core.thesis_condition;
    drop table if exists core.thesis_version;
  `.execute(database);
}
