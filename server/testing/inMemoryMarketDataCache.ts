import type { CacheRecord, MarketDataCache, RefreshAttempt } from "../core/providerTypes";

export class InMemoryMarketDataCache implements MarketDataCache {
  private readonly records = new Map<string, CacheRecord<unknown>>();
  private readonly cooldowns = new Map<RefreshAttempt["source"], string>();
  readonly attempts: RefreshAttempt[] = [];

  async get<T>(key: string): Promise<CacheRecord<T> | undefined> { return this.records.get(key) as CacheRecord<T> | undefined; }
  async put<T>(record: CacheRecord<T>): Promise<void> {
    const current = this.records.get(record.key);
    if (!current || record.fetchedAt >= current.fetchedAt) this.records.set(record.key, record as CacheRecord<unknown>);
  }
  async markCooldown(source: RefreshAttempt["source"], until: string): Promise<void> { this.cooldowns.set(source, until); }
  async getCooldown(source: RefreshAttempt["source"]): Promise<string | undefined> { return this.cooldowns.get(source); }
  async recordRefreshAttempt(attempt: RefreshAttempt): Promise<void> { this.attempts.push(attempt); }
  async health() { return { writable: true, entries: this.records.size }; }
}
