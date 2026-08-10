import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, NotificationDeliveryTable } from "../db/types";
import { consumeOnce } from "../platform/outboxRepository";
import type { PushPayload } from "./pushProvider";

export interface NotificationDeliveryView {
  id: string;
  eventId: string;
  alertId: string;
  subscriptionId: string;
  payload: PushPayload;
  status: "pending" | "succeeded" | "invalid" | "dead_letter";
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
}

function toView(row: Selectable<NotificationDeliveryTable>): NotificationDeliveryView {
  return {
    id: row.id, eventId: row.eventId, alertId: row.alertId, subscriptionId: row.subscriptionId,
    payload: row.payloadJson as PushPayload, status: row.status, attemptCount: row.attemptCount,
    ...(row.nextAttemptAt ? { nextAttemptAt: row.nextAttemptAt.toISOString() } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
  };
}

export class NotificationRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  async prepare(eventId: string, alertId: string, payload: PushPayload, subscriptionIds: string[]): Promise<NotificationDeliveryView[]> {
    await this.database.transaction().execute(async (transaction) => {
      await consumeOnce(transaction, "notification-worker", eventId, async (executor) => {
        if (subscriptionIds.length === 0) return;
        await executor.insertInto("notification.delivery").values(subscriptionIds.map((subscriptionId) => ({
          id: randomUUID(), eventId, alertId, subscriptionId, payloadJson: JSON.stringify(payload), status: "pending" as const,
          attemptCount: 0, nextAttemptAt: null, lastError: null, createdAt: this.now(), completedAt: null,
        }))).onConflict((conflict) => conflict.columns(["alertId", "subscriptionId"]).doNothing()).execute();
      });
    });
    if (subscriptionIds.length === 0) return [];
    const rows = await this.database.selectFrom("notification.delivery").selectAll().where("alertId", "=", alertId).where("subscriptionId", "in", subscriptionIds).execute();
    return rows.map(toView);
  }

  async get(id: string): Promise<NotificationDeliveryView | undefined> {
    const row = await this.database.selectFrom("notification.delivery").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toView(row) : undefined;
  }

  async recordAttempt(id: string, attempt: { outcome: "succeeded" | "retry" | "invalid" | "failed"; statusCode?: number; error?: string }): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      const row = await transaction.selectFrom("notification.delivery").select("attemptCount").where("id", "=", id).forUpdate().executeTakeFirstOrThrow();
      const attemptNumber = row.attemptCount + 1;
      await transaction.insertInto("notification.delivery_attempt").values({ id: randomUUID(), deliveryId: id, attemptNumber, outcome: attempt.outcome, statusCode: attempt.statusCode ?? null, error: attempt.error ?? null, attemptedAt: this.now() }).execute();
      await transaction.updateTable("notification.delivery").set({ attemptCount: attemptNumber, lastError: attempt.error ?? null }).where("id", "=", id).execute();
    });
  }

  async markSucceeded(id: string): Promise<void> {
    await this.database.updateTable("notification.delivery").set({ status: "succeeded", completedAt: this.now(), nextAttemptAt: null }).where("id", "=", id).where("status", "=", "pending").execute();
  }

  async markRetry(id: string, delayMs: number, error: string): Promise<void> {
    await this.database.updateTable("notification.delivery").set({ nextAttemptAt: new Date(this.now().getTime() + delayMs), lastError: error }).where("id", "=", id).where("status", "=", "pending").execute();
  }

  async markTerminal(id: string, status: "invalid" | "dead_letter", reason: string, eventId?: string): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      const row = await transaction.updateTable("notification.delivery").set({ status, lastError: reason, completedAt: this.now(), nextAttemptAt: null }).where("id", "=", id).where("status", "=", "pending").returning(["id", "eventId", "payloadJson"]).executeTakeFirst();
      if (row && status === "dead_letter") await transaction.insertInto("platform.dead_letter").values({ id: randomUUID(), consumer: "notification-worker", eventId: eventId ?? row.eventId, reason, payloadJson: JSON.stringify(row.payloadJson), createdAt: this.now() }).execute();
    });
  }

  async countDeliveries(alertId: string): Promise<number> {
    const row = await this.database.selectFrom("notification.delivery").select(({ fn }) => fn.countAll<number>().as("count")).where("alertId", "=", alertId).executeTakeFirstOrThrow();
    return Number(row.count);
  }
}
