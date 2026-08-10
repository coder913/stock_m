import { sql, type Transaction } from "kysely";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";

export interface StoredHttpResponse {
  statusCode: number;
  body: unknown;
}

export type IdempotencyRetention = "ordinary" | "permanent";

export interface IdempotencyStore {
  execute(
    transaction: Transaction<Database>, key: string, fingerprint: string,
    command: () => Promise<StoredHttpResponse>, retention?: IdempotencyRetention,
  ): Promise<StoredHttpResponse>;
}

const ordinaryRetentionMs = 30 * 24 * 60 * 60 * 1_000;
const permanentExpiry = new Date("9999-12-31T23:59:59.999Z");

export class IdempotencyRepository implements IdempotencyStore {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async execute(
    transaction: Transaction<Database>, key: string, fingerprint: string,
    command: () => Promise<StoredHttpResponse>, retention: IdempotencyRetention = "ordinary",
  ): Promise<StoredHttpResponse> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(transaction);
    const now = this.now();
    const existing = await transaction.selectFrom("platform.idempotency_record").selectAll()
      .where("key", "=", key).executeTakeFirst();

    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for a different request", 409, false);
      }
      return { statusCode: existing.statusCode, body: existing.responseJson };
    }
    if (existing) await transaction.deleteFrom("platform.idempotency_record").where("key", "=", key).execute();

    const response = await command();
    if (response.statusCode < 500) {
      await transaction.insertInto("platform.idempotency_record").values({
        key, fingerprint, statusCode: response.statusCode, responseJson: response.body, createdAt: now,
        expiresAt: retention === "permanent" ? permanentExpiry : new Date(now.getTime() + ordinaryRetentionMs),
      }).execute();
    }
    return response;
  }
}
