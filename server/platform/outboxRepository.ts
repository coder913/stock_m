import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, OutboxEventTable } from "../db/types";

export interface NewOutboxEvent {
  id: string;
  topic: string;
  aggregateId: string;
  payloadJson: unknown;
  occurredAt: Date;
}

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export class OutboxRepository {
  async append(executor: DatabaseExecutor, event: NewOutboxEvent): Promise<void> {
    await executor.insertInto("platform.outbox_event").values({ ...event, payloadJson: JSON.stringify(event.payloadJson), publishedAt: null, attempts: 0 }).execute();
  }

  listUnpublishedForUpdate(transaction: Transaction<Database>, limit: number): Promise<Selectable<OutboxEventTable>[]> {
    return transaction.selectFrom("platform.outbox_event").selectAll().where("publishedAt", "is", null)
      .orderBy("occurredAt", "asc").orderBy("id", "asc").limit(limit).forUpdate().skipLocked().execute();
  }

  async markPublished(transaction: Transaction<Database>, id: string, publishedAt: Date): Promise<void> {
    await transaction.updateTable("platform.outbox_event").set({ publishedAt }).where("id", "=", id).execute();
  }

  async recordFailure(transaction: Transaction<Database>, id: string): Promise<void> {
    await transaction.updateTable("platform.outbox_event").set(({ eb }) => ({ attempts: eb("attempts", "+", 1) }))
      .where("id", "=", id).execute();
  }
}

export async function consumeOnce(
  transaction: Transaction<Database>, consumer: string, eventId: string,
  effect: (transaction: Transaction<Database>) => Promise<void>,
): Promise<boolean> {
  const inserted = await transaction.insertInto("platform.inbox_event").values({ consumer, eventId, consumedAt: new Date() })
    .onConflict((conflict) => conflict.columns(["consumer", "eventId"]).doNothing())
    .returning("eventId").executeTakeFirst();
  if (!inserted) return false;
  await effect(transaction);
  return true;
}
