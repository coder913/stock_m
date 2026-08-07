import type { DataEnvelope, ProviderSource } from "../../src/features/market/apiDomain";
import type { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { ApiError, ProviderRateLimitError } from "./errors";
import type { ProviderResult } from "./providerTypes";

export interface ReadThroughRequest<T> { key: string; source: ProviderSource; ttlMs: number; forceRefresh?: boolean; load: () => Promise<ProviderResult<T>>; }

export class MarketDataGateway {
  constructor(private readonly dependencies: { cache: SqliteMarketDataCache; now: () => string }) {}

  async readThrough<T>(request: ReadThroughRequest<T>): Promise<DataEnvelope<T>> {
    const now = this.dependencies.now();
    const cached = this.dependencies.cache.get<T>(request.key);
    if (cached && cached.expiresAt > now && !request.forceRefresh) return this.toEnvelope(cached, false);
    const cooldown = this.dependencies.cache.getCooldown(request.source);
    if (cooldown && cooldown > now) return this.staleOrThrow(cached, "数据源暂时冷却，正在显示最后成功数据", now);
    try {
      const result = await request.load();
      const expiresAt = new Date(new Date(now).getTime() + request.ttlMs).toISOString();
      this.dependencies.cache.put({ key: request.key, ...result, fetchedAt: now, expiresAt, notices: result.notices ?? [] });
      return this.toEnvelope(this.dependencies.cache.get<T>(request.key)!, false);
    } catch (error) {
      if (error instanceof ProviderRateLimitError) this.dependencies.cache.markCooldown(request.source, error.retryAfter);
      const notice = error instanceof ProviderRateLimitError ? "数据源限额，正在显示最后成功数据" : request.forceRefresh && cached && cached.expiresAt > now ? "刷新失败，继续显示最后成功数据" : "数据源暂时不可用，正在显示最后成功数据";
      return this.staleOrThrow(cached, notice, now);
    }
  }

  private staleOrThrow<T>(cached: { data: T; source: DataEnvelope<T>["source"]; asOf: string; fetchedAt: string; expiresAt: string; delayMinutes?: number; notices: string[] } | undefined, notice: string, now: string): DataEnvelope<T> {
    if (!cached) throw new ApiError("PROVIDER_UNAVAILABLE", "暂时无法获取数据", 503, true);
    return { ...this.toEnvelope(cached, cached.expiresAt <= now), notices: [...cached.notices, notice] };
  }

  private toEnvelope<T>(record: { data: T; source: DataEnvelope<T>["source"]; asOf: string; fetchedAt: string; expiresAt: string; delayMinutes?: number; notices: string[] }, stale: boolean): DataEnvelope<T> {
    return { data: record.data, source: record.source, asOf: record.asOf, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt, stale, delayMinutes: record.delayMinutes, notices: record.notices };
  }
}
