import type { IgnoredSplitDecision } from "./domain";

const key = "stock_m:ignored-splits:v1";
const symbolPattern = /^[A-Z0-9.-]+$/;
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));

export class SplitDecisionRepository {
  constructor(private readonly storage: Storage) {}

  ignore(input: IgnoredSplitDecision): IgnoredSplitDecision {
    this.validate(input);
    const existing = this.read().find((item) => item.sourceEventId === input.sourceEventId);
    if (existing) return immutable(existing);
    const decision = immutable({ ...clone(input), symbol: input.symbol.toUpperCase(), note: input.note.trim() });
    this.storage.setItem(key, JSON.stringify([...this.read(), decision]));
    return decision;
  }

  list(): IgnoredSplitDecision[] {
    return this.read().map(immutable);
  }

  private read(): IgnoredSplitDecision[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(key) || "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        try {
          this.validate(item as IgnoredSplitDecision);
          return [clone(item as IgnoredSplitDecision)];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  private validate(input: IgnoredSplitDecision): void {
    if (!input.sourceEventId?.trim()) throw new Error("拆股事件 ID 无效");
    if (!symbolPattern.test(input.symbol?.trim().toUpperCase())) throw new Error("股票代码无效");
    if (!input.note?.trim()) throw new Error("忽略拆股必须填写备注");
    if (!input.ignoredAt || Number.isNaN(Date.parse(input.ignoredAt))) throw new Error("忽略时间无效");
  }
}
