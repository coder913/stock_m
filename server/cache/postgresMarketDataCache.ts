import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import type { CacheHealth, CacheRecord, MarketDataCache, RefreshAttempt } from "../core/providerTypes";
import type { ProviderSource } from "../../src/features/market/apiDomain";

function validJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError();
    return serialized;
  } catch {
    throw new TypeError("Cache payload must be valid JSON");
  }
}

const iso = (value: Date): string => value.toISOString();

export class PostgresMarketDataCache implements MarketDataCache {
  constructor(private readonly database: Kysely<Database>) {}

  async get<T>(key: string): Promise<CacheRecord<T> | undefined> {
    const row = await this.database.selectFrom("market.cache_entry").selectAll().where("cacheKey", "=", key).executeTakeFirst();
    if (!row) return undefined;
    return {
      key: row.cacheKey,
      source: row.source as CacheRecord<T>["source"],
      data: row.payloadJson as T,
      asOf: iso(row.asOf),
      fetchedAt: iso(row.fetchedAt),
      expiresAt: iso(row.expiresAt),
      ...(row.delayMinutes === null ? {} : { delayMinutes: row.delayMinutes }),
      notices: row.noticesJson as string[],
    };
  }

  async put<T>(record: CacheRecord<T>): Promise<void> {
    const payloadJson = validJson(record.data);
    const noticesJson = validJson(record.notices);
    await this.database.insertInto("market.cache_entry").values({
      cacheKey: record.key,
      source: record.source,
      payloadJson,
      asOf: record.asOf,
      fetchedAt: record.fetchedAt,
      expiresAt: record.expiresAt,
      delayMinutes: record.delayMinutes ?? null,
      noticesJson,
    }).onConflict((conflict) => conflict.column("cacheKey").doUpdateSet((excluded) => ({
      source: excluded.ref("excluded.source"),
      payloadJson: excluded.ref("excluded.payloadJson"),
      asOf: excluded.ref("excluded.asOf"),
      fetchedAt: excluded.ref("excluded.fetchedAt"),
      expiresAt: excluded.ref("excluded.expiresAt"),
      delayMinutes: excluded.ref("excluded.delayMinutes"),
      noticesJson: excluded.ref("excluded.noticesJson"),
    })).whereRef("excluded.fetchedAt", ">=", "market.cache_entry.fetchedAt")).execute();
  }

  async markCooldown(source: ProviderSource, until: string, errorCode?: string): Promise<void> {
    await this.database.insertInto("market.provider_state").values({ source, cooldownUntil: until, lastSuccessAt: null, lastErrorCode: errorCode ?? null })
      .onConflict((conflict) => conflict.column("source").doUpdateSet({ cooldownUntil: until, ...(errorCode ? { lastErrorCode: errorCode } : {}) })).execute();
  }

  async getCooldown(source: ProviderSource): Promise<string | undefined> {
    const row = await this.database.selectFrom("market.provider_state").select("cooldownUntil").where("source", "=", source).executeTakeFirst();
    return row?.cooldownUntil ? iso(row.cooldownUntil) : undefined;
  }

  async recordRefreshAttempt(attempt: RefreshAttempt): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      await transaction.insertInto("market.refresh_attempt").values({ cacheKey: attempt.key, source: attempt.source, status: attempt.status, errorCode: attempt.errorCode ?? null, attemptedAt: attempt.attemptedAt }).execute();
      await transaction.insertInto("market.provider_state").values({
        source: attempt.source,
        cooldownUntil: null,
        lastSuccessAt: attempt.status === "success" ? attempt.attemptedAt : null,
        lastErrorCode: attempt.status === "error" ? attempt.errorCode ?? "UNKNOWN" : null,
      }).onConflict((conflict) => conflict.column("source").doUpdateSet(attempt.status === "success"
        ? { lastSuccessAt: attempt.attemptedAt, lastErrorCode: null }
        : { lastErrorCode: attempt.errorCode ?? "UNKNOWN" })).execute();
    });
  }

  async health(): Promise<CacheHealth> {
    const row = await this.database.selectFrom("market.cache_entry")
      .select((expression) => [expression.fn.countAll<number>().as("entries"), expression.fn.min<Date>("fetchedAt").as("oldestFetchedAt")])
      .executeTakeFirstOrThrow();
    return { writable: true, entries: Number(row.entries), ...(row.oldestFetchedAt ? { oldestFetchedAt: iso(row.oldestFetchedAt) } : {}) };
  }
}
