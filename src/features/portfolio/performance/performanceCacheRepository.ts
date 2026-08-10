import type { CacheablePerformanceResult, PerformanceCacheKeyInput } from "./domain";

const key = "stock_m:portfolio-performance-cache:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOptionalFiniteNumber = (value: unknown): boolean => value === undefined || isFiniteNumber(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isResourceState = (value: unknown): boolean => value === "fresh" || value === "stale" || value === "unavailable";

const validPoint = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.marketDate === "string"
    && typeof value.valuedAt === "string"
    && isFiniteNumber(value.cash)
    && isFiniteNumber(value.externalFlow)
    && isResourceState(value.dataState)
    && isStringArray(value.missingSymbols)
    && ["holdingsValue", "totalValue", "dailyReturn", "cumulativeTwr", "normalizedPortfolio", "benchmarkValue", "benchmarkReturn", "excessReturn", "drawdown"].every((field) => isOptionalFiniteNumber(value[field]));
};

const validDailyInternal = (value: unknown): boolean => {
  if (!isRecord(value)
    || typeof value.marketDate !== "string"
    || typeof value.valuedAt !== "string"
    || typeof value.periodStartedAt !== "string"
    || !["beginningValue", "endingValue", "modifiedDietzDenominator", "dailyReturn"].every((field) => isOptionalFiniteNumber(value[field]))
    || !["deposits", "withdrawals", "externalFlow", "fees"].every((field) => isFiniteNumber(value[field]))
    || !isResourceState(value.dataState)
    || !isRecord(value.positions)) return false;
  return Object.values(value.positions).every((position) => isRecord(position)
    && ["quantity", "cost", "realizedPnl", "beginningMarketValue", "buyCashPaid", "sellCashReceived", "realizedPnlChange", "dividends"].every((field) => isFiniteNumber(position[field]))
    && isOptionalFiniteNumber(position.endingMarketValue));
};

const validPerformanceResult = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.points) || !value.points.every(validPoint) || !Array.isArray(value.dailyInternals) || !value.dailyInternals.every(validDailyInternal) || !isStringArray(value.warnings)) return false;
  const summary = value.summary;
  if (!isRecord(summary) || typeof summary.from !== "string" || typeof summary.to !== "string") return false;
  if (!["twr", "mwr", "annualizedReturn", "benchmarkReturn", "excessReturn", "currentDrawdown", "maximumDrawdown", "positiveDayRate"].every((field) => isOptionalFiniteNumber(summary[field]))) return false;
  if (summary.availableFrom !== undefined && typeof summary.availableFrom !== "string") return false;
  const interval = value.interval;
  return isRecord(interval)
    && ["beginningValue", "endingValue", "deposits", "withdrawals"].every((field) => isFiniteNumber(interval[field]));
};

const validAttribution = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!isRecord(value) || !Array.isArray(value.items) || !isFiniteNumber(value.totalMoneyPnl) || typeof value.reconciled !== "boolean") return false;
  return value.items.every((item) => isRecord(item)
    && typeof item.key === "string"
    && typeof item.label === "string"
    && (item.symbol === undefined || typeof item.symbol === "string")
    && ["moneyContribution", "realizedPnl", "unrealizedPnl", "dividends", "fees"].every((field) => isFiniteNumber(item[field]))
    && isOptionalFiniteNumber(item.returnContribution));
};

const validMarketEvent = (value: unknown): boolean => {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || value.type !== "split"
    || typeof value.symbol !== "string"
    || typeof value.scheduledAt !== "string"
    || typeof value.source !== "string") return false;
  const split = value.split;
  return split === undefined || (isRecord(split)
    && ["oldRate", "newRate", "quantityMultiplier"].every((field) => isOptionalFiniteNumber(split[field]))
    && (split.effectiveDate === undefined || typeof split.effectiveDate === "string"));
};

const validPerformanceViewModel = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.pendingSplits) || !value.pendingSplits.every(validMarketEvent) || !isStringArray(value.notices) || !isResourceState(value.dataState)) return false;
  if (!isRecord(value.provenance) || typeof value.provenance.source !== "string") return false;
  if (value.provenance.asOf !== undefined && typeof value.provenance.asOf !== "string") return false;
  if (value.provenance.availableFrom !== undefined && typeof value.provenance.availableFrom !== "string") return false;
  return (value.result === undefined || validPerformanceResult(value.result)) && validAttribution(value.attribution);
};

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
    return validPerformanceResult(value) || validPerformanceViewModel(value);
  }
}
