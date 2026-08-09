import type { ConditionEvaluation } from "./domain";

const evaluationKey = "stock_m:condition-evaluations:v1";
const clone = <T,>(value: T): T => structuredClone(value);

function isEvaluation(value: unknown): value is ConditionEvaluation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConditionEvaluation>;
  return typeof item.id === "string" && typeof item.conditionId === "string" && typeof item.conditionVersion === "string" && ["pending", "confirmed", "breached", "expired"].includes(item.status ?? "") && ["fresh", "missing", "stale", "unavailable"].includes(item.dataState ?? "") && typeof item.explanation === "string" && typeof item.evaluatedAt === "string";
}

export class EvaluationRepository {
  constructor(private readonly storage: Storage) {}

  append(evaluation: ConditionEvaluation): { evaluation: ConditionEvaluation; inserted: boolean } {
    const all = this.read();
    const key = this.dedupeKey(evaluation);
    const existing = all.find((item) => this.dedupeKey(item) === key);
    if (existing) return { evaluation: clone(existing), inserted: false };
    const stored = clone(evaluation);
    all.push(stored);
    this.write(all);
    return { evaluation: clone(stored), inserted: true };
  }

  latest(conditionId: string): ConditionEvaluation | undefined {
    return this.list(conditionId).sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt))[0];
  }

  latestDecisive(conditionId: string): ConditionEvaluation | undefined {
    return this.list(conditionId).filter((item) => item.dataState === "fresh" && (item.status === "confirmed" || item.status === "breached")).sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt))[0];
  }

  list(conditionId: string): ConditionEvaluation[] {
    return this.read().filter((item) => item.conditionId === conditionId).sort((left, right) => left.evaluatedAt.localeCompare(right.evaluatedAt)).map(clone);
  }

  private dedupeKey(item: ConditionEvaluation): string { return `${item.conditionId}:${item.conditionVersion}:${item.dataState}:${item.status}:${item.asOf ?? ""}`; }
  private read(): ConditionEvaluation[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(evaluationKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter(isEvaluation).map(clone) : [];
    } catch { return []; }
  }
  private write(items: ConditionEvaluation[]): void { this.storage.setItem(evaluationKey, JSON.stringify(items)); }
}
