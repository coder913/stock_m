import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table broker.order_intent alter column quantity type numeric(29,9);
    alter table broker.fill alter column quantity type numeric(29,9);
    alter table broker.activity alter column quantity type numeric(29,9);
    alter table broker.ledger_event alter column quantity type numeric(29,9);
    alter table broker.position_snapshot alter column quantity type numeric(29,9)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table broker.order_intent alter column quantity type numeric(28,8) using round(quantity,8);
    alter table broker.fill alter column quantity type numeric(28,8) using round(quantity,8);
    alter table broker.activity alter column quantity type numeric(28,8) using round(quantity,8);
    alter table broker.ledger_event alter column quantity type numeric(28,8) using round(quantity,8);
    alter table broker.position_snapshot alter column quantity type numeric(28,8) using round(quantity,8)
  `.execute(database);
}
