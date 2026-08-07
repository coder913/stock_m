import type { ProviderSource } from "../../src/features/market/apiDomain";

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

export interface HealthCache { health(): CacheHealth; }
