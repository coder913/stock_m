import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create schema if not exists notification;
    create table notification.push_subscription (
      id uuid primary key,
      endpoint_hash text not null unique,
      ciphertext text not null,
      iv text not null,
      auth_tag text not null,
      user_agent text not null,
      created_at timestamptz not null,
      last_seen_at timestamptz not null,
      revoked_at timestamptz,
      invalid_at timestamptz
    );
    create index push_subscription_active_idx on notification.push_subscription(last_seen_at desc)
      where revoked_at is null and invalid_at is null;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists notification.push_subscription`.execute(database);
  await sql`drop schema if exists notification`.execute(database);
}
