import type { DataSource, ProviderSource } from "../../src/features/market/apiDomain";

export interface ProviderResult<T> {
  data: T;
  source: ProviderSource;
  asOf: string;
  delayMinutes?: number;
  notices?: string[];
}

export interface CacheHealth {
  writable: boolean;
  entries: number;
  oldestFetchedAt?: string;
}

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

export interface RefreshAttempt {
  key: string;
  source: ProviderSource;
  status: "success" | "error";
  errorCode?: string;
  attemptedAt: string;
}

export interface MarketDataCache {
  get<T>(key: string): Promise<CacheRecord<T> | undefined>;
  put<T>(record: CacheRecord<T>): Promise<void>;
  markCooldown(source: ProviderSource, until: string, errorCode?: string): Promise<void>;
  getCooldown(source: ProviderSource): Promise<string | undefined>;
  recordRefreshAttempt(attempt: RefreshAttempt): Promise<void>;
  health(): Promise<CacheHealth>;
}

export interface HealthCache { health(): Promise<CacheHealth>; }
