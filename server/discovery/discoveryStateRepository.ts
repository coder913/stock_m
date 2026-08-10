import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { SavedScreen, SavedScreenInput, ScreenerCondition, ScreenerMetric, UserUniverseState } from "../../shared/discoveryState";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";

type Executor = Transaction<Database>;
const normalizeSymbol = (symbol: string) => {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.-]+$/.test(normalized)) throw new ApiError("INVALID_SYMBOL", "股票代码格式无效", 400);
  return normalized;
};

export class PostgresDiscoveryStateRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  async getUniverseState(executor: Kysely<Database> | Executor = this.database): Promise<UserUniverseState> {
    const [revision, symbols] = await Promise.all([
      executor.selectFrom("core.user_universe_revision").select("version").where("id", "=", "local-single-user").executeTakeFirstOrThrow(),
      executor.selectFrom("core.user_universe_symbol").select(["symbol", "kind"]).orderBy("symbol", "asc").execute(),
    ]);
    return { addedSymbols: symbols.filter(({ kind }) => kind === "added").map(({ symbol }) => symbol),
      removedDefaultSymbols: symbols.filter(({ kind }) => kind === "removed_default").map(({ symbol }) => symbol), version: revision.version };
  }

  addUniverseSymbol(symbol: string, version: number, executor?: Executor): Promise<UserUniverseState> {
    return this.changeUniverse(normalizeSymbol(symbol), "added", version, executor);
  }
  removeUniverseSymbol(symbol: string, version: number, executor?: Executor): Promise<UserUniverseState> {
    return this.changeUniverse(normalizeSymbol(symbol), "removed_default", version, executor);
  }
  restoreUniverseSymbol(symbol: string, version: number, executor?: Executor): Promise<UserUniverseState> {
    return this.changeUniverse(normalizeSymbol(symbol), null, version, executor);
  }

  async listScreens(executor: Kysely<Database> | Executor = this.database): Promise<SavedScreen[]> {
    const rows = await executor.selectFrom("core.saved_screen").selectAll().where("deletedAt", "is", null).orderBy("ordinal", "asc").execute();
    return rows.map((row) => this.mapScreen(row));
  }

  createScreen(input: SavedScreenInput, executor?: Executor): Promise<SavedScreen> {
    return this.inTransaction(executor, async (transaction) => {
      this.validateScreen(input);
      const now = this.now();
      const id = randomUUID();
      await transaction.insertInto("core.saved_screen").values({ id, name: input.name.trim(), conditionsJson: JSON.stringify(input.conditions),
        sortMetric: input.sort.metric, sortDirection: input.sort.direction, version: 1, createdAt: now, updatedAt: now, deletedAt: null }).execute();
      return this.requireScreen(transaction, id);
    });
  }

  renameScreen(id: string, name: string, version: number, executor?: Executor): Promise<SavedScreen> {
    return this.inTransaction(executor, async (transaction) => {
      const trimmed = name.trim();
      if (!trimmed) throw new ApiError("INVALID_SCREEN_NAME", "筛选名称不能为空", 400);
      const updated = await transaction.updateTable("core.saved_screen")
        .set(({ eb }) => ({ name: trimmed, version: eb("version", "+", 1), updatedAt: this.now() }))
        .where("id", "=", id).where("version", "=", version).where("deletedAt", "is", null).returning("id").executeTakeFirst();
      if (!updated) throw await this.screenConflict(transaction, id);
      return this.requireScreen(transaction, id);
    });
  }

  duplicateScreen(id: string, executor?: Executor): Promise<SavedScreen> {
    return this.inTransaction(executor, async (transaction) => {
      const source = await this.requireScreen(transaction, id);
      return this.createScreen({ name: `${source.name}副本`, conditions: source.conditions, sort: source.sort }, transaction);
    });
  }

  removeScreen(id: string, version: number, executor?: Executor): Promise<void> {
    return this.inTransaction(executor, async (transaction) => {
      const updated = await transaction.updateTable("core.saved_screen").set(({ eb }) => ({
        deletedAt: this.now(), updatedAt: this.now(), version: eb("version", "+", 1),
      })).where("id", "=", id).where("version", "=", version).where("deletedAt", "is", null).returning("id").executeTakeFirst();
      if (!updated) throw await this.screenConflict(transaction, id);
    });
  }

  private changeUniverse(symbol: string, kind: "added" | "removed_default" | null, version: number, executor?: Executor): Promise<UserUniverseState> {
    return this.inTransaction(executor, async (transaction) => {
      const revision = await transaction.selectFrom("core.user_universe_revision").select("version")
        .where("id", "=", "local-single-user").forUpdate().executeTakeFirstOrThrow();
      if (revision.version !== version) throw new ApiError("VERSION_CONFLICT", "用户股票池已被更新", 409, false, { latest: await this.getUniverseState(transaction) });
      if (kind) {
        await transaction.insertInto("core.user_universe_symbol").values({ symbol, kind, createdAt: this.now() })
          .onConflict((conflict) => conflict.column("symbol").doUpdateSet({ kind })).execute();
      } else {
        await transaction.deleteFrom("core.user_universe_symbol").where("symbol", "=", symbol).execute();
      }
      await transaction.updateTable("core.user_universe_revision").set({ version: version + 1 })
        .where("id", "=", "local-single-user").execute();
      return this.getUniverseState(transaction);
    });
  }

  private validateScreen(input: SavedScreenInput): void {
    if (!input.name.trim()) throw new ApiError("INVALID_SCREEN_NAME", "筛选名称不能为空", 400);
    if (!Array.isArray(input.conditions)) throw new ApiError("INVALID_SCREEN", "筛选条件无效", 400);
  }

  private async requireScreen(executor: Kysely<Database> | Executor, id: string): Promise<SavedScreen> {
    const row = await executor.selectFrom("core.saved_screen").selectAll().where("id", "=", id).where("deletedAt", "is", null).executeTakeFirst();
    if (!row) throw new ApiError("SAVED_SCREEN_NOT_FOUND", "未找到保存的筛选器", 404);
    return this.mapScreen(row);
  }

  private mapScreen(row: { id: string; name: string; conditionsJson: unknown; sortMetric: string; sortDirection: "asc" | "desc"; version: number; createdAt: Date; updatedAt: Date }): SavedScreen {
    return { id: row.id, name: row.name, conditions: row.conditionsJson as ScreenerCondition[],
      sort: { metric: row.sortMetric as ScreenerMetric, direction: row.sortDirection }, version: row.version,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  private async screenConflict(transaction: Executor, id: string): Promise<ApiError> {
    const existing = await transaction.selectFrom("core.saved_screen").selectAll().where("id", "=", id).executeTakeFirst();
    return existing ? new ApiError("VERSION_CONFLICT", "保存的筛选器已被更新", 409, false, { latest: this.mapScreen(existing) }) : new ApiError("SAVED_SCREEN_NOT_FOUND", "未找到保存的筛选器", 404);
  }

  private inTransaction<T>(executor: Executor | undefined, action: (transaction: Executor) => Promise<T>): Promise<T> {
    return executor ? action(executor) : this.database.transaction().execute(action);
  }
}
