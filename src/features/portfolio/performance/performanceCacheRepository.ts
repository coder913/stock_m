import type { CacheablePerformanceResult, PerformanceCacheKeyInput } from "./domain";

const key = "stock_m:portfolio-performance-cache:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));

interface CacheEntry {
  key: string;
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

  get(cacheKey: string): CacheablePerformanceResult | undefined {
    const entry = this.read().find((item) => item.key === cacheKey);
    return entry ? immutable(entry.result) : undefined;
  }

  put(cacheKey: string, result: CacheablePerformanceResult, createdAt = new Date().toISOString()): void {
    if (!this.validResult(result)) throw new Error("绩效缓存结果无效");
    const entries = this.read().filter((entry) => entry.key !== cacheKey);
    entries.push({ key: cacheKey, result: clone(result), createdAt });
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
          && typeof entry.createdAt === "string"
          && !Number.isNaN(Date.parse(entry.createdAt))
          && this.validResult(entry.result)
          ? [entry as CacheEntry]
          : [];
      });
    } catch {
      return [];
    }
  }

  private validResult(value: unknown): value is CacheablePerformanceResult {
    return Boolean(value && typeof value === "object" && Array.isArray((value as { points?: unknown }).points));
  }
}
