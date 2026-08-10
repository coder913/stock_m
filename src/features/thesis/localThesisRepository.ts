import type { Thesis } from "../../../shared/thesis";
export type { Thesis } from "../../../shared/thesis";

const clone = <T,>(value: T): T => structuredClone(value);
const legacyCreatedAt = "1970-01-01T00:00:00.000Z";

export class LocalThesisRepository {
  constructor(private readonly storage: Storage) {}
  private readonly key = "stock_m:theses";

  getHistory(symbol: string): Thesis[] {
    const normalized = symbol.toUpperCase();
    return this.read().filter((item) => item.symbol.toUpperCase() === normalized).sort((left, right) => left.version - right.version).map(clone);
  }

  getLatest(symbol: string): Thesis | undefined {
    return this.getHistory(symbol).sort((left, right) => right.version - left.version)[0];
  }

  save(input: Omit<Thesis, "id" | "version" | "createdAt">, now = new Date().toISOString()): Thesis {
    if (!input.coreJudgment.trim() || !input.evidence.length || !input.risks.length || !input.validationConditions.length) throw new Error("请完整填写投资逻辑");
    const symbol = input.symbol.toUpperCase();
    const history = this.getHistory(symbol);
    const item: Thesis = { symbol, coreJudgment: input.coreJudgment, evidence: [...input.evidence], risks: [...input.risks], validationConditions: [...input.validationConditions], id: crypto.randomUUID(), version: Math.max(0, ...history.map((thesis) => thesis.version)) + 1, createdAt: now };
    const all = this.readRaw();
    this.storage.setItem(this.key, JSON.stringify([...all, item]));
    return clone(item);
  }

  private readRaw(): Array<Omit<Thesis, "createdAt"> & { createdAt?: string }> {
    try { const parsed: unknown = JSON.parse(this.storage.getItem(this.key) || "[]"); return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Array<Omit<Thesis, "createdAt"> & { createdAt?: string }> : []; } catch { return []; }
  }
  private read(): Thesis[] { return this.readRaw().map((item) => ({ ...item, createdAt: item.createdAt ?? legacyCreatedAt })); }
}
