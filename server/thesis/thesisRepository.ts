import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { ConditionDraft, ThesisCondition } from "../../shared/monitoring";
import type { Thesis, ThesisDraft } from "../../shared/thesis";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";

type Executor = Transaction<Database>;
const normalizeSymbol = (symbol: string) => {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.-]+$/.test(normalized)) throw new ApiError("INVALID_SYMBOL", "股票代码格式无效", 400, false);
  return normalized;
};
const ignoredConditionKeys = new Set(["id", "conditionVersion", "createdAt", "updatedAt", "deletedAt", "symbol", "thesisVersionId"]);
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, child]) => !ignoredConditionKeys.has(key) && child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}
function conditionVersion(value: unknown): string {
  const input = JSON.stringify(canonicalize(value)); let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class PostgresThesisRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  create(draft: ThesisDraft, executor?: Executor): Promise<Thesis> {
    return this.inTransaction(executor, async (transaction) => {
      const symbol = normalizeSymbol(draft.symbol);
      this.validateDraft(draft);
      await sql`select pg_advisory_xact_lock(hashtext(${symbol}))`.execute(transaction);
      const latest = await transaction.selectFrom("core.thesis_version").select("version").where("symbol", "=", symbol).orderBy("version", "desc").executeTakeFirst();
      const id = randomUUID();
      await transaction.insertInto("core.thesis_version").values({ id, symbol, version: (latest?.version ?? 0) + 1, coreJudgment: draft.coreJudgment.trim(), evidenceJson: JSON.stringify(draft.evidence), risksJson: JSON.stringify(draft.risks), validationConditionsJson: JSON.stringify(draft.validationConditions), createdAt: this.now() }).execute();
      return this.require(transaction, id);
    });
  }

  async getHistory(symbol: string, executor: Kysely<Database> | Executor = this.database): Promise<Thesis[]> {
    const rows = await executor.selectFrom("core.thesis_version").selectAll().where("symbol", "=", normalizeSymbol(symbol)).orderBy("version", "asc").execute();
    return rows.map((row) => this.mapThesis(row));
  }
  async getLatest(symbol: string, executor: Kysely<Database> | Executor = this.database): Promise<Thesis | undefined> {
    const row = await executor.selectFrom("core.thesis_version").selectAll().where("symbol", "=", normalizeSymbol(symbol)).orderBy("version", "desc").executeTakeFirst();
    return row ? this.mapThesis(row) : undefined;
  }
  async listLatest(executor: Kysely<Database> | Executor = this.database): Promise<Thesis[]> {
    const rows = await executor.selectFrom("core.thesis_version as thesis").selectAll("thesis")
      .where("version", "=", (builder) => builder.selectFrom("core.thesis_version as candidate").select(({ fn }) => fn.max("candidate.version").as("version")).whereRef("candidate.symbol", "=", "thesis.symbol"))
      .orderBy("symbol", "asc").execute();
    return rows.map((row) => this.mapThesis(row));
  }

  createConditions(input: { symbol: string; thesisVersionId: string; conditions: ConditionDraft[] }, executor?: Executor): Promise<ThesisCondition[]> {
    return this.inTransaction(executor, async (transaction) => {
      const symbol = normalizeSymbol(input.symbol);
      await this.assertCurrent(transaction, symbol, input.thesisVersionId);
      const now = this.now();
      for (const draft of input.conditions) {
        if (!draft.id.trim() || !draft.name.trim()) throw new ApiError("INVALID_CONDITION", "监控条件无效", 400, false);
        await transaction.insertInto("core.thesis_condition").values({ id: draft.id, thesisVersionId: input.thesisVersionId, symbol, kind: draft.kind, name: draft.name.trim(), direction: draft.direction, severity: draft.severity, deadline: draft.deadline ?? null, note: draft.note ?? null, specJson: JSON.stringify(draft), conditionVersion: conditionVersion(draft), createdAt: now, updatedAt: now, deletedAt: null }).execute();
      }
      return this.listConditions(input.thesisVersionId, { executor: transaction });
    });
  }

  async listConditions(thesisVersionId: string, options: { includeDeleted?: boolean; executor?: Kysely<Database> | Executor } = {}): Promise<ThesisCondition[]> {
    let query = (options.executor ?? this.database).selectFrom("core.thesis_condition").selectAll().where("thesisVersionId", "=", thesisVersionId);
    if (!options.includeDeleted) query = query.where("deletedAt", "is", null);
    const rows = await query.orderBy("createdAt", "asc").orderBy("id", "asc").execute();
    return rows.map((row) => this.mapCondition(row));
  }

  softDeleteCondition(id: string, executor?: Executor): Promise<ThesisCondition> {
    return this.inTransaction(executor, async (transaction) => {
      const row = await transaction.selectFrom("core.thesis_condition").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!row) throw new ApiError("CONDITION_NOT_FOUND", "未找到监控条件", 404, false);
      await this.assertCurrent(transaction, row.symbol, row.thesisVersionId);
      const now = this.now();
      const updated = await transaction.updateTable("core.thesis_condition").set({ deletedAt: now, updatedAt: now }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
      return this.mapCondition(updated);
    });
  }

  async copyConditions(sourceThesisVersionId: string, targetThesisVersionId: string, executor?: Executor): Promise<ThesisCondition[]> {
    return this.inTransaction(executor, async (transaction) => {
      const target = await this.require(transaction, targetThesisVersionId);
      await this.assertCurrent(transaction, target.symbol, targetThesisVersionId);
      const source = await this.listConditions(sourceThesisVersionId, { executor: transaction });
      const drafts = source.map(({ id: _id, symbol: _symbol, thesisVersionId: _thesis, createdAt: _created, updatedAt: _updated, deletedAt: _deleted, conditionVersion: _version, ...draft }) => ({ ...draft, id: randomUUID() })) as ConditionDraft[];
      return this.createConditions({ symbol: target.symbol, thesisVersionId: targetThesisVersionId, conditions: drafts }, transaction);
    });
  }

  private async assertCurrent(executor: Executor, symbol: string, thesisVersionId: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtext(${symbol}))`.execute(executor);
    const current = await executor.selectFrom("core.thesis_version").select("id").where("symbol", "=", symbol).orderBy("version", "desc").forUpdate().executeTakeFirst();
    if (!current || current.id !== thesisVersionId) throw new ApiError("THESIS_VERSION_NOT_CURRENT", "只能修改当前投资逻辑版本", 409, false, { currentThesisVersionId: current?.id });
  }
  private validateDraft(draft: ThesisDraft): void {
    if (!draft.coreJudgment.trim() || !draft.evidence.length || !draft.risks.length || !draft.validationConditions.length) throw new ApiError("INVALID_THESIS", "请完整填写投资逻辑", 400, false);
  }
  private async require(executor: Kysely<Database> | Executor, id: string): Promise<Thesis> {
    const row = await executor.selectFrom("core.thesis_version").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw new ApiError("THESIS_NOT_FOUND", "未找到投资逻辑", 404, false);
    return this.mapThesis(row);
  }
  private mapThesis(row: { id: string; symbol: string; version: number; coreJudgment: string; evidenceJson: unknown; risksJson: unknown; validationConditionsJson: unknown; createdAt: Date }): Thesis {
    return { id: row.id, symbol: row.symbol, version: row.version, coreJudgment: row.coreJudgment, evidence: row.evidenceJson as string[], risks: row.risksJson as string[], validationConditions: row.validationConditionsJson as string[], createdAt: row.createdAt.toISOString() };
  }
  private mapCondition(row: { id: string; thesisVersionId: string; symbol: string; kind: "metric" | "event"; name: string; direction: "support" | "risk"; severity: "low" | "medium" | "high"; deadline: string | null; note: string | null; specJson: unknown; conditionVersion: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null }): ThesisCondition {
    return { ...(row.specJson as ConditionDraft), id: row.id, thesisVersionId: row.thesisVersionId, symbol: row.symbol, kind: row.kind, name: row.name, direction: row.direction, severity: row.severity, ...(row.deadline ? { deadline: row.deadline } : {}), ...(row.note ? { note: row.note } : {}), conditionVersion: row.conditionVersion, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...(row.deletedAt ? { deletedAt: row.deletedAt.toISOString() } : {}) } as ThesisCondition;
  }
  private inTransaction<T>(executor: Executor | undefined, action: (transaction: Executor) => Promise<T>): Promise<T> { return executor ? action(executor) : this.database.transaction().execute(action); }
}
