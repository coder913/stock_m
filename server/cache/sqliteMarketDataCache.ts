import Database from "better-sqlite3";
import type { DataSource, ProviderSource } from "../../src/features/market/apiDomain";
import type { CacheHealth } from "../core/providerTypes";

export interface CacheRecord<T> {
  key: string;
  source: DataSource;
  data: T;
  asOf: string;
  fetchedAt: string;
  expiresAt: string;
  delayMinutes?: number;
  notices: string[];
}

export class SqliteMarketDataCache {
  private readonly database: Database.Database;

  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.exec(`CREATE TABLE IF NOT EXISTS market_cache (cache_key TEXT PRIMARY KEY, source TEXT NOT NULL, payload_json TEXT NOT NULL, as_of TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL, delay_minutes INTEGER, notices_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_state (source TEXT PRIMARY KEY, cooldown_until TEXT, last_success_at TEXT, last_error_code TEXT);`);
  }

  get<T>(key: string): CacheRecord<T> | undefined {
    const row = this.database.prepare("SELECT * FROM market_cache WHERE cache_key = ?").get(key) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { key: row.cache_key as string, source: row.source as DataSource, data: JSON.parse(row.payload_json as string) as T, asOf: row.as_of as string, fetchedAt: row.fetched_at as string, expiresAt: row.expires_at as string, delayMinutes: row.delay_minutes === null ? undefined : row.delay_minutes as number, notices: JSON.parse(row.notices_json as string) as string[] };
  }

  put<T>(record: CacheRecord<T>): void {
    const payload = JSON.stringify(record.data);
    const notices = JSON.stringify(record.notices);
    this.database.transaction(() => {
      this.database.prepare(`INSERT INTO market_cache (cache_key, source, payload_json, as_of, fetched_at, expires_at, delay_minutes, notices_json)
        VALUES (@key, @source, @payload, @asOf, @fetchedAt, @expiresAt, @delayMinutes, @notices)
        ON CONFLICT(cache_key) DO UPDATE SET source = excluded.source, payload_json = excluded.payload_json, as_of = excluded.as_of, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at, delay_minutes = excluded.delay_minutes, notices_json = excluded.notices_json`)
        .run({ ...record, payload, notices, delayMinutes: record.delayMinutes ?? null });
    })();
  }

  markCooldown(source: ProviderSource, until: string): void {
    this.database.prepare("INSERT INTO provider_state (source, cooldown_until) VALUES (?, ?) ON CONFLICT(source) DO UPDATE SET cooldown_until = excluded.cooldown_until").run(source, until);
  }

  getCooldown(source: ProviderSource): string | undefined {
    const row = this.database.prepare("SELECT cooldown_until FROM provider_state WHERE source = ?").get(source) as { cooldown_until: string | null } | undefined;
    return row?.cooldown_until ?? undefined;
  }

  health(): CacheHealth {
    const row = this.database.prepare("SELECT COUNT(*) AS entries, MIN(fetched_at) AS oldest FROM market_cache").get() as { entries: number; oldest: string | null };
    return { writable: true, entries: row.entries, oldestFetchedAt: row.oldest ?? undefined };
  }

  close(): void { this.database.close(); }
}
