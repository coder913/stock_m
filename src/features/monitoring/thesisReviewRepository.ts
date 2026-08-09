import type { ReviewConditionSnapshot, ThesisReview } from "./domain";

const reviewKey = "stock_m:thesis-reviews:v1";
const clone = <T,>(value: T): T => structuredClone(value);
type ReviewDecision = ThesisReview["decision"];
const statuses = new Set(["pending", "confirmed", "breached", "expired"]);
const severities = new Set(["low", "medium", "high"]);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));
const isSnapshot = (value: unknown): value is ReviewConditionSnapshot => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ReviewConditionSnapshot>;
  return typeof item.conditionId === "string" && Boolean(item.conditionId.trim()) && typeof item.conditionVersion === "string" && /^[0-9a-f]{8}$/.test(item.conditionVersion) && typeof item.name === "string" && Boolean(item.name.trim()) && severities.has(item.severity ?? "") && statuses.has(item.status ?? "");
};

export interface RecordReviewInput {
  thesisVersionId: string;
  symbol: string;
  decision: ReviewDecision;
  note?: string;
  conditionSnapshot: ReviewConditionSnapshot[];
  createdAt?: string;
}

function isReview(value: unknown): value is ThesisReview {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ThesisReview>;
  return typeof item.id === "string" && Boolean(item.id.trim()) && typeof item.thesisVersionId === "string" && Boolean(item.thesisVersionId.trim()) && typeof item.symbol === "string" && Boolean(item.symbol.trim()) && ["reaffirmed", "invalidated", "archived"].includes(item.decision ?? "") && (item.note === undefined || typeof item.note === "string") && Array.isArray(item.conditionSnapshot) && item.conditionSnapshot.every(isSnapshot) && typeof item.createdAt === "string" && isIsoDate(item.createdAt);
}

export class ThesisReviewRepository {
  constructor(private readonly storage: Storage) {}

  record(input: RecordReviewInput): ThesisReview {
    if (!["reaffirmed", "invalidated", "archived"].includes(input.decision)) throw new Error("无效的复核决策");
    if (!input.thesisVersionId.trim() || !input.symbol.trim()) throw new Error("投资逻辑版本和股票不能为空");
    const review: ThesisReview = { id: crypto.randomUUID(), ...clone(input), symbol: input.symbol.toUpperCase(), createdAt: input.createdAt ?? new Date().toISOString() };
    const all = this.read();
    all.push(review);
    this.write(all);
    return clone(review);
  }

  latest(thesisVersionId: string): ThesisReview | undefined { return this.list(thesisVersionId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]; }
  list(thesisVersionId: string): ThesisReview[] { return this.read().filter((review) => review.thesisVersionId === thesisVersionId).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map(clone); }
  private read(): ThesisReview[] { try { const parsed: unknown = JSON.parse(this.storage.getItem(reviewKey) || "[]"); return Array.isArray(parsed) ? parsed.filter(isReview).map(clone) : []; } catch { return []; } }
  private write(items: ThesisReview[]): void { this.storage.setItem(reviewKey, JSON.stringify(items)); }
}
