import { conditionVersion } from "./conditionVersion";
import type { ConditionDraft, MonitorMetric, ThesisCondition } from "./domain";

const conditionKey = "stock_m:thesis-conditions:v1";
const metrics = new Set<MonitorMetric>(["price", "dailyChangePercent", "revenueGrowthYoY", "operatingMargin", "freeCashFlow", "freeCashFlowYield", "netDebtToEbitda", "earningsSurprise", "grossMarginYoYChange", "priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d"]);
const clone = <T,>(value: T): T => structuredClone(value);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));

function isCondition(value: unknown): value is ThesisCondition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ThesisCondition>;
  if (typeof item.id !== "string" || typeof item.symbol !== "string" || typeof item.thesisVersionId !== "string" || typeof item.name !== "string" || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return false;
  if (item.kind === "metric") return metrics.has(item.metric as MonitorMetric) && [">", ">=", "<", "<=", "between"].includes(item.operator ?? "") && (typeof item.target === "number" || Array.isArray(item.target));
  return item.kind === "event" && ["earnings", "dividend", "split", "corporate-action", "macro"].includes(item.eventType ?? "") && ["before-date", "within-range", "not-occurred-by-date"].includes(item.occurrence ?? "") && typeof item.to === "string";
}

function validateDraft(draft: ConditionDraft): void {
  if (!draft.id.trim() || !draft.name.trim()) throw new Error("条件名称和 ID 不能为空");
  if (draft.deadline && !isIsoDate(draft.deadline)) throw new Error("截止日期无效");
  if (draft.kind === "metric") {
    if (!metrics.has(draft.metric)) throw new Error("不支持的监控指标");
    if (draft.operator === "between" && (!Array.isArray(draft.target) || draft.target.length !== 2 || draft.target[0] > draft.target[1])) throw new Error("区间下限不能大于上限");
    if (draft.operator !== "between" && typeof draft.target !== "number") throw new Error("比较目标必须是数值");
    return;
  }
  if (!isIsoDate(draft.to) || (draft.from && !isIsoDate(draft.from))) throw new Error("事件日期无效");
  if (draft.occurrence === "within-range" && (!draft.from || draft.from > draft.to)) throw new Error("事件起始日期不能晚于结束日期");
}

export class ConditionRepository {
  private warnings: string[] = [];

  constructor(private readonly storage: Storage) {}

  saveForThesis(input: { symbol: string; thesisVersionId: string; conditions: ConditionDraft[]; now?: string }): ThesisCondition[] {
    const symbol = input.symbol.trim().toUpperCase();
    const thesisVersionId = input.thesisVersionId.trim();
    const now = input.now ?? new Date().toISOString();
    if (!symbol || !thesisVersionId) throw new Error("股票和投资逻辑版本不能为空");
    if (!isIsoDate(now)) throw new Error("保存时间无效");
    if (new Set(input.conditions.map((condition) => condition.id)).size !== input.conditions.length) throw new Error("条件 ID 不能重复");
    input.conditions.forEach(validateDraft);
    const all = this.read();
    const existingIds = new Set(all.map((condition) => condition.id));
    if (input.conditions.some((condition) => existingIds.has(condition.id))) throw new Error("条件 ID 已存在");
    const saved = input.conditions.map((draft) => ({ ...clone(draft), symbol, thesisVersionId, createdAt: now, updatedAt: now, deletedAt: undefined, conditionVersion: conditionVersion(draft) }) as ThesisCondition);
    this.write([...all, ...saved]);
    return saved.map(clone);
  }

  listForThesis(thesisVersionId: string, options: { includeDeleted?: boolean } = {}): ThesisCondition[] {
    return this.read().filter((condition) => condition.thesisVersionId === thesisVersionId && (options.includeDeleted || !condition.deletedAt)).map(clone);
  }

  listActive(symbols?: string[]): ThesisCondition[] {
    const allowed = symbols?.length ? new Set(symbols.map((symbol) => symbol.toUpperCase())) : undefined;
    return this.read().filter((condition) => !condition.deletedAt && (!allowed || allowed.has(condition.symbol))).map(clone);
  }

  softDelete(id: string, deletedAt: string): ThesisCondition {
    if (!isIsoDate(deletedAt)) throw new Error("删除时间无效");
    const all = this.read();
    const index = all.findIndex((condition) => condition.id === id);
    if (index < 0) throw new Error("未找到监控条件");
    all[index] = { ...all[index], deletedAt, updatedAt: deletedAt };
    this.write(all);
    return clone(all[index]);
  }

  getWarnings(): string[] { return [...this.warnings]; }

  private read(): ThesisCondition[] {
    this.warnings = [];
    let parsed: unknown;
    try { parsed = JSON.parse(this.storage.getItem(conditionKey) || "[]"); } catch { parsed = []; }
    const items: unknown[] = Array.isArray(parsed) ? parsed : [];
    const valid = items.filter(isCondition);
    const skipped = items.length - valid.length;
    if (skipped) this.warnings.push(`已跳过 ${skipped} 条损坏的监控条件`);
    return valid.map(clone);
  }

  private write(conditions: ThesisCondition[]): void { this.storage.setItem(conditionKey, JSON.stringify(conditions)); }
}
