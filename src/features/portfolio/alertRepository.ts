import type { AlertCandidate, PortfolioAlert } from "./domain";
const key = "stock_m:portfolio-alerts:v1";
const rank = { info: 0, warning: 1, critical: 2 };
const clone = <T,>(value: T): T => structuredClone(value);

export class AlertRepository {
  constructor(private readonly storage: Storage) {}
  list(): PortfolioAlert[] { return this.read().map(clone); }
  get(id: string): PortfolioAlert { const alert = this.read().find((item) => item.id === id); if (!alert) throw new Error("未找到提醒"); return clone(alert); }
  reconcile(candidates: AlertCandidate[], calculatedAt: string): PortfolioAlert[] {
    const all = this.read(); const result: PortfolioAlert[] = [];
    for (const candidate of candidates) { const existing = all.find((item) => item.dedupeKey === candidate.dedupeKey && item.status !== "resolved"); if (existing) { Object.assign(existing, candidate, { severity: rank[candidate.severity] > rank[existing.severity] ? candidate.severity : existing.severity, updatedAt: calculatedAt }); result.push(existing); } else { const created: PortfolioAlert = { ...candidate, id: globalThis.crypto?.randomUUID?.() ?? `alert-${Date.now()}-${result.length}`, status: "open", createdAt: calculatedAt, updatedAt: calculatedAt }; all.push(created); result.push(created); } }
    this.write(all); return result.map(clone);
  }
  acknowledge(id: string): PortfolioAlert { return this.update(id, { status: "open" }); }
  snooze(id: string, until: string): PortfolioAlert { return this.update(id, { status: "snoozed", snoozedUntil: until }); }
  resolve(id: string): PortfolioAlert { return this.update(id, { status: "resolved", resolvedAt: new Date().toISOString() }); }
  restoreDue(now: string): void { const all = this.read().map((item) => item.status === "snoozed" && item.snoozedUntil && item.snoozedUntil <= now ? { ...item, status: "open" as const, snoozedUntil: undefined, updatedAt: now } : item); this.write(all); }
  private update(id: string, change: Partial<PortfolioAlert>): PortfolioAlert { const all = this.read(); const index = all.findIndex((item) => item.id === id); if (index < 0) throw new Error("未找到提醒"); all[index] = { ...all[index], ...change, updatedAt: new Date().toISOString() }; this.write(all); return clone(all[index]); }
  private read(): PortfolioAlert[] { try { return JSON.parse(this.storage.getItem(key) || "[]") as PortfolioAlert[]; } catch { return []; } }
  private write(alerts: PortfolioAlert[]): void { this.storage.setItem(key, JSON.stringify(alerts)); }
}
