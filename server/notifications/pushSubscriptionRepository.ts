import { randomUUID } from "node:crypto";
import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, PushSubscriptionTable } from "../db/types";
import { decryptSubscription, encryptSubscription, endpointHash, type WebPushSubscription } from "./subscriptionCrypto";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export interface PushSubscriptionView {
  id: string;
  endpointHash: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  invalidAt?: string;
}

export interface ActivePushSubscription {
  id: string;
  endpointHash: string;
  subscription: WebPushSubscription;
}

function toView(row: Selectable<PushSubscriptionTable>): PushSubscriptionView {
  return {
    id: row.id,
    endpointHash: row.endpointHash,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
    ...(row.invalidAt ? { invalidAt: row.invalidAt.toISOString() } : {}),
  };
}

export class PushSubscriptionRepository {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly encryptionKey: Buffer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsert(subscription: WebPushSubscription, userAgent: string, executor: DatabaseExecutor = this.database): Promise<PushSubscriptionView> {
    const hash = endpointHash(subscription.endpoint);
    const encrypted = encryptSubscription(subscription, this.encryptionKey);
    const now = this.now();
    const row = await executor.insertInto("notification.push_subscription").values({
      id: randomUUID(), endpointHash: hash, ...encrypted, userAgent, createdAt: now, lastSeenAt: now, revokedAt: null, invalidAt: null,
    }).onConflict((conflict) => conflict.column("endpointHash").doUpdateSet({
      ...encrypted, userAgent, lastSeenAt: now, revokedAt: null, invalidAt: null,
    })).returningAll().executeTakeFirstOrThrow();
    return toView(row);
  }

  async list(): Promise<PushSubscriptionView[]> {
    const rows = await this.database.selectFrom("notification.push_subscription").selectAll().orderBy("lastSeenAt", "desc").execute();
    return rows.map(toView);
  }

  async revoke(hash: string, executor: DatabaseExecutor = this.database): Promise<boolean> {
    const result = await executor.updateTable("notification.push_subscription").set({ revokedAt: this.now() }).where("endpointHash", "=", hash).where("revokedAt", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async invalidate(id: string, executor: DatabaseExecutor = this.database): Promise<boolean> {
    const result = await executor.updateTable("notification.push_subscription").set({ invalidAt: this.now() }).where("id", "=", id).where("invalidAt", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async loadActive(): Promise<ActivePushSubscription[]> {
    const rows = await this.database.selectFrom("notification.push_subscription").selectAll()
      .where("revokedAt", "is", null).where("invalidAt", "is", null).orderBy("createdAt", "asc").execute();
    return rows.map((row) => ({ id: row.id, endpointHash: row.endpointHash, subscription: decryptSubscription(row, this.encryptionKey) }));
  }

  async listActiveIds(): Promise<string[]> {
    const rows = await this.database.selectFrom("notification.push_subscription").select("id")
      .where("revokedAt", "is", null).where("invalidAt", "is", null).orderBy("createdAt", "asc").execute();
    return rows.map(({ id }) => id);
  }

  async loadActiveById(id: string): Promise<ActivePushSubscription | undefined> {
    const row = await this.database.selectFrom("notification.push_subscription").selectAll().where("id", "=", id)
      .where("revokedAt", "is", null).where("invalidAt", "is", null).executeTakeFirst();
    return row ? { id: row.id, endpointHash: row.endpointHash, subscription: decryptSubscription(row, this.encryptionKey) } : undefined;
  }
}
