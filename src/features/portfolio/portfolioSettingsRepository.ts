import type { LedgerEvent, PortfolioSettings } from "./domain";

const settingsKey = "stock_m:portfolio-settings:v1";
const symbolPattern = /^[A-Z0-9.-]+$/;
const clone = <T,>(value: T): T => structuredClone(value);

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const toNewYorkMarketDate = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) throw new Error("发生时间无效");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export class PortfolioSettingsRepository {
  private recoveryNotice: string | undefined;

  constructor(
    private readonly storage: Storage,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly earliestEventDate: () => string | undefined = () => undefined,
  ) {}

  get(): PortfolioSettings {
    const stored = this.storage.getItem(settingsKey);
    if (!stored) return this.defaults(this.now());
    try {
      const value = JSON.parse(stored) as unknown;
      if (!this.isSettings(value)) throw new Error("invalid settings");
      return clone(value);
    } catch {
      const timestamp = this.now();
      this.storage.setItem(`stock_m:portfolio-settings:corrupt:${timestamp}`, stored);
      this.storage.removeItem(settingsKey);
      const recovered = this.defaults(timestamp);
      this.storage.setItem(settingsKey, JSON.stringify(recovered));
      this.recoveryNotice = "组合设置损坏，已恢复默认设置";
      return clone(recovered);
    }
  }

  save(
    input: Omit<PortfolioSettings, "version" | "updatedAt">,
    now = this.now(),
  ): PortfolioSettings {
    const normalized = {
      ...input,
      benchmarkSymbol: input.benchmarkSymbol.trim().toUpperCase(),
    };
    this.validate(normalized, now, this.earliestEventDate());
    const settings: PortfolioSettings = {
      version: 1,
      ...normalized,
      baseCurrency: "USD",
      updatedAt: now,
    };
    this.storage.setItem(settingsKey, JSON.stringify(settings));
    this.recoveryNotice = undefined;
    return clone(settings);
  }

  migrate(events: LedgerEvent[], now = this.now()): PortfolioSettings {
    const eventDates = events.map((event) => toNewYorkMarketDate(event.occurredAt)).sort();
    if (this.storage.getItem(settingsKey)) {
      const current = this.get();
      if (!this.recoveryNotice) return current;
      const recovered = {
        ...current,
        inceptionDate: eventDates[0] ?? now.slice(0, 10),
        updatedAt: now,
      };
      this.storage.setItem(settingsKey, JSON.stringify(recovered));
      return clone(recovered);
    }
    const settings: PortfolioSettings = {
      ...this.defaults(now),
      inceptionDate: eventDates[0] ?? now.slice(0, 10),
      updatedAt: now,
    };
    this.storage.setItem(settingsKey, JSON.stringify(settings));
    return clone(settings);
  }

  getRecoveryNotice(): string | undefined {
    return this.recoveryNotice;
  }

  private defaults(now: string): PortfolioSettings {
    return {
      version: 1,
      initialCash: 10_000,
      inceptionDate: now.slice(0, 10),
      benchmarkSymbol: "SPY",
      baseCurrency: "USD",
      updatedAt: now,
    };
  }

  private validate(
    input: Omit<PortfolioSettings, "version" | "updatedAt">,
    now: string,
    earliestEventDate?: string,
  ): void {
    if (!Number.isFinite(input.initialCash) || input.initialCash < 0) {
      throw new Error("初始资金必须是非负有限数");
    }
    if (!validDate(input.inceptionDate) || input.inceptionDate > now.slice(0, 10)) {
      throw new Error("成立日期无效或晚于今天");
    }
    if (earliestEventDate && input.inceptionDate > earliestEventDate) {
      throw new Error("成立日期不得晚于最早账本事件");
    }
    if (!symbolPattern.test(input.benchmarkSymbol)) {
      throw new Error("基准代码格式无效");
    }
    if (input.baseCurrency !== "USD") throw new Error("基础货币仅支持 USD");
  }

  private isSettings(value: unknown): value is PortfolioSettings {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<PortfolioSettings>;
    try {
      this.validate({
        initialCash: item.initialCash as number,
        inceptionDate: item.inceptionDate as string,
        benchmarkSymbol: item.benchmarkSymbol as string,
        baseCurrency: item.baseCurrency as "USD",
      }, item.updatedAt ?? this.now());
      return item.version === 1
        && typeof item.updatedAt === "string"
        && !Number.isNaN(Date.parse(item.updatedAt));
    } catch {
      return false;
    }
  }
}
