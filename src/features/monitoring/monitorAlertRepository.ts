import type { ConditionSeverity, ConditionStatus, MonitorAlert } from "./domain";

const alertKey = "stock_m:monitor-alerts:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const statuses = new Set(["pending", "confirmed", "breached", "expired"]);
const severities = new Set(["low", "medium", "high"]);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));
const isOptionalDate = (value: unknown) => value === undefined || (typeof value === "string" && isIsoDate(value));

export interface AlertTransitionInput {
  symbol: string;
  thesisVersionId: string;
  conditionId: string;
  conditionVersion: string;
  fromStatus?: ConditionStatus;
  toStatus: ConditionStatus;
  severity: ConditionSeverity;
  title: string;
  explanation: string;
  asOf?: string;
  createdAt: string;
}

export interface AlertListQuery {
  view: "pending" | "snoozed" | "archived";
  now: string;
  symbol?: string;
  severity?: ConditionSeverity;
  toStatus?: ConditionStatus;
  from?: string;
  to?: string;
}

function isAlert(value: unknown): value is MonitorAlert {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MonitorAlert>;
  return typeof item.id === "string" && Boolean(item.id.trim()) && typeof item.dedupeKey === "string" && Boolean(item.dedupeKey.trim()) && typeof item.symbol === "string" && Boolean(item.symbol.trim()) && typeof item.thesisVersionId === "string" && Boolean(item.thesisVersionId.trim()) && typeof item.conditionId === "string" && Boolean(item.conditionId.trim()) && typeof item.conditionVersion === "string" && /^[0-9a-f]{8}$/.test(item.conditionVersion) && statuses.has(item.toStatus ?? "") && (item.fromStatus === undefined || statuses.has(item.fromStatus)) && severities.has(item.severity ?? "") && typeof item.title === "string" && Boolean(item.title.trim()) && typeof item.explanation === "string" && isOptionalDate(item.asOf) && typeof item.createdAt === "string" && isIsoDate(item.createdAt) && isOptionalDate(item.readAt) && isOptionalDate(item.snoozedUntil) && isOptionalDate(item.archivedAt);
}

export class MonitorAlertRepository {
  constructor(private readonly storage: Storage) {}

  createTransition(input: AlertTransitionInput): MonitorAlert | undefined {
    if ((!input.fromStatus || input.fromStatus === "pending") && input.toStatus === "confirmed") return undefined;
    const dedupeKey = `${input.thesisVersionId}:${input.conditionId}:${input.conditionVersion}:${input.toStatus}:${input.asOf ?? ""}`;
    const all = this.read();
    const existing = all.find((alert) => alert.dedupeKey === dedupeKey);
    if (existing) return clone(existing);
    const alert: MonitorAlert = { id: crypto.randomUUID(), dedupeKey, ...clone(input) };
    all.push(alert);
    this.write(all);
    return clone(alert);
  }

  list(query: AlertListQuery): MonitorAlert[] {
    return this.read().filter((alert) => {
      if (query.view === "archived") {
        if (!alert.archivedAt) return false;
      } else {
        if (alert.archivedAt) return false;
        if (query.view === "snoozed" ? !alert.snoozedUntil || alert.snoozedUntil <= query.now : Boolean(alert.snoozedUntil && alert.snoozedUntil > query.now)) return false;
      }
      if (query.symbol && alert.symbol !== query.symbol.toUpperCase()) return false;
      if (query.severity && alert.severity !== query.severity) return false;
      if (query.toStatus && alert.toStatus !== query.toStatus) return false;
      if (query.from && alert.createdAt.slice(0, 10) < query.from) return false;
      if (query.to && alert.createdAt.slice(0, 10) > query.to) return false;
      return true;
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clone);
  }

  markRead(id: string, readAt = new Date().toISOString()): MonitorAlert { return this.update(id, { readAt }); }
  snooze(id: string, snoozedUntil: string): MonitorAlert { return this.update(id, { snoozedUntil }); }
  archive(id: string, archivedAt = new Date().toISOString()): MonitorAlert { return this.update(id, { archivedAt }); }
  restoreDue(now: string): void {
    const all = this.read().map((alert) => alert.snoozedUntil && alert.snoozedUntil <= now ? { ...alert, snoozedUntil: undefined } : alert);
    this.write(all);
  }

  private update(id: string, change: Partial<MonitorAlert>): MonitorAlert {
    const all = this.read();
    const index = all.findIndex((alert) => alert.id === id);
    if (index < 0) throw new Error("未找到监控提醒");
    all[index] = { ...all[index], ...change };
    this.write(all);
    return clone(all[index]);
  }
  private read(): MonitorAlert[] {
    try { const parsed: unknown = JSON.parse(this.storage.getItem(alertKey) || "[]"); return Array.isArray(parsed) ? parsed.filter(isAlert).map(clone) : []; } catch { return []; }
  }
  private write(items: MonitorAlert[]): void { this.storage.setItem(alertKey, JSON.stringify(items)); }
}
