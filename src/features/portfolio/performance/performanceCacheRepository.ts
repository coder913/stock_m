import type { CacheablePerformanceResult, PerformanceCacheKeyInput } from "./domain";

const key = "stock_m:portfolio-performance-cache:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));

interface CacheEntry {
  key: string;
  identityKey: string;
  result: CacheablePerformanceResult;
  createdAt: string;
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([entryKey, entryValue]) => [entryKey, canonicalize(entryValue)]));
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export class PerformanceCacheRepository {
  constructor(private readonly storage: Storage) {}

  key(input: PerformanceCacheKeyInput): string {
    const normalized = {
      ...input,
      benchmark: input.benchmark.toUpperCase(),
      events: [...input.events].sort((left, right) => left.id.localeCompare(right.id)),
    };
    return `performance:${fnv1a(JSON.stringify(canonicalize(normalized)))}`;
  }

  latestKey(input: PerformanceCacheKeyInput): string {
    const { holdingsAsOf: _holdingsAsOf, benchmarkAsOf: _benchmarkAsOf, ...identity } = input;
    return this.key(identity);
  }

  get<T extends CacheablePerformanceResult = CacheablePerformanceResult>(cacheKey: string): T | undefined {
    const entry = this.read().find((item) => item.key === cacheKey);
    return entry ? immutable(entry.result) as T : undefined;
  }

  getLatest<T extends CacheablePerformanceResult = CacheablePerformanceResult>(identityKey: string): T | undefined {
    const entry = this.read().find((item) => item.identityKey === identityKey);
    return entry ? immutable(entry.result) as T : undefined;
  }

  put(cacheKey: string, result: CacheablePerformanceResult, createdAt = new Date().toISOString(), identityKey = cacheKey): void {
    if (!this.validResult(result)) throw new Error("绩效缓存结果无效");
    const entries = this.read().filter((entry) => entry.key !== cacheKey);
    entries.push({ key: cacheKey, identityKey, result: clone(result), createdAt });
    entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    this.storage.setItem(key, JSON.stringify(entries.slice(0, 10)));
  }

  private read(): CacheEntry[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(key) || "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Partial<CacheEntry>;
        return typeof entry.key === "string"
          && (entry.identityKey === undefined || typeof entry.identityKey === "string")
          && typeof entry.createdAt === "string"
          && !Number.isNaN(Date.parse(entry.createdAt))
          && this.validResult(entry.result)
          ? [{ ...entry, identityKey: entry.identityKey ?? entry.key } as CacheEntry]
          : [];
      });
    } catch {
      return [];
    }
  }

  private validResult(value: unknown): value is CacheablePerformanceResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { points?: unknown; result?: { points?: unknown } };
    return Array.isArray(candidate.points) || Array.isArray(candidate.result?.points);
  }
}
