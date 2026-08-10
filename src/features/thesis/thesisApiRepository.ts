import type { ConditionDraft, ThesisCondition } from "../../../shared/monitoring";
import type { Thesis, ThesisDraft } from "../../../shared/thesis";
import { ApiClient } from "../../app/apiClient";

const key = (provided?: string) => provided ?? globalThis.crypto.randomUUID();
export interface ThesisStateService {
  listLatest(): Promise<Thesis[]>;
  getLatest(symbol: string): Promise<Thesis | undefined>;
  getHistory(symbol: string): Promise<Thesis[]>;
  create(draft: ThesisDraft, idempotencyKey?: string): Promise<Thesis>;
  listConditions(thesisVersionId: string): Promise<ThesisCondition[]>;
  createConditions(input: { symbol: string; thesisVersionId: string; conditions: ConditionDraft[] }, idempotencyKey?: string): Promise<ThesisCondition[]>;
  softDeleteCondition(conditionId: string, idempotencyKey?: string): Promise<ThesisCondition>;
  copyConditions(sourceThesisVersionId: string, targetThesisVersionId: string, idempotencyKey?: string): Promise<ThesisCondition[]>;
}
export class ThesisApiRepository implements ThesisStateService {
  constructor(private readonly client = new ApiClient("/api/v1")) {}
  listLatest(): Promise<Thesis[]> { return this.client.requestJson({ path: "/theses" }); }
  async getLatest(symbol: string): Promise<Thesis | undefined> { return (await this.client.requestJson<Thesis | null>({ path: `/theses/${encodeURIComponent(symbol.toUpperCase())}/latest` })) ?? undefined; }
  getHistory(symbol: string): Promise<Thesis[]> { return this.client.requestJson({ path: `/theses/${encodeURIComponent(symbol.toUpperCase())}/history` }); }
  create(draft: ThesisDraft, idempotencyKey?: string): Promise<Thesis> { return this.client.requestJson({ method: "POST", path: "/theses", body: draft, idempotencyKey: key(idempotencyKey) }); }
  listConditions(thesisVersionId: string): Promise<ThesisCondition[]> { return this.client.requestJson({ path: `/theses/${encodeURIComponent(thesisVersionId)}/conditions` }); }
  createConditions(input: { symbol: string; thesisVersionId: string; conditions: ConditionDraft[] }, idempotencyKey?: string): Promise<ThesisCondition[]> { return this.client.requestJson({ method: "POST", path: `/theses/${encodeURIComponent(input.thesisVersionId)}/conditions`, body: { symbol: input.symbol, conditions: input.conditions }, idempotencyKey: key(idempotencyKey) }); }
  softDeleteCondition(conditionId: string, idempotencyKey?: string): Promise<ThesisCondition> { return this.client.requestJson({ method: "DELETE", path: `/thesis-conditions/${encodeURIComponent(conditionId)}`, idempotencyKey: key(idempotencyKey) }); }
  copyConditions(sourceThesisVersionId: string, targetThesisVersionId: string, idempotencyKey?: string): Promise<ThesisCondition[]> { return this.client.requestJson({ method: "POST", path: `/theses/${encodeURIComponent(targetThesisVersionId)}/conditions/copy`, body: { sourceThesisVersionId }, idempotencyKey: key(idempotencyKey) }); }
}
