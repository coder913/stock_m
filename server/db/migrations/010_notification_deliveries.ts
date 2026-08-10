import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table notification.delivery (
      id uuid primary key,
      event_id text not null,
      alert_id text not null,
      subscription_id uuid not null references notification.push_subscription(id) on delete cascade,
      payload_json jsonb not null,
      status text not null check (status in ('pending', 'succeeded', 'invalid', 'dead_letter')),
      attempt_count integer not null default 0 check (attempt_count >= 0),
      next_attempt_at timestamptz,
      last_error text,
      created_at timestamptz not null,
      completed_at timestamptz,
      unique (alert_id, subscription_id)
    );
    create index notification_delivery_pending_idx on notification.delivery(next_attempt_at, created_at)
      where status = 'pending';

    create table notification.delivery_attempt (
      id uuid primary key,
      delivery_id uuid not null references notification.delivery(id) on delete cascade,
      attempt_number integer not null check (attempt_number > 0),
      outcome text not null check (outcome in ('succeeded', 'retry', 'invalid', 'failed')),
      status_code integer,
      error text,
      attempted_at timestamptz not null,
      unique (delivery_id, attempt_number)
    );
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists notification.delivery_attempt`.execute(database);
  await sql`drop table if exists notification.delivery`.execute(database);
}
