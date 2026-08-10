import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { WatchlistGroup } from "../../shared/watchlist";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";

type Executor = Transaction<Database>;
const normalizeSymbol = (symbol: string) => {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.-]+$/.test(normalized)) throw new ApiError("INVALID_SYMBOL", "股票代码格式无效", 400);
  return normalized;
};

export class PostgresWatchlistRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  list(): Promise<WatchlistGroup[]> { return this.read(false); }
  listDeleted(): Promise<WatchlistGroup[]> { return this.read(true); }

  createGroup(name: string, executor?: Executor): Promise<WatchlistGroup> {
    return this.inTransaction(executor, async (transaction) => {
      const trimmed = name.trim();
      if (!trimmed) throw new ApiError("INVALID_WATCHLIST_NAME", "自选分组名称不能为空", 400);
      await sql`select pg_advisory_xact_lock(19370301)`.execute(transaction);
      const current = await transaction.selectFrom("core.watchlist_group").select("orderIndex")
        .where("deletedAt", "is", null).orderBy("orderIndex", "desc").executeTakeFirst();
      const now = this.now();
      const id = randomUUID();
      await transaction.insertInto("core.watchlist_group").values({
        id, name: trimmed, orderIndex: current ? Number(current.orderIndex) + 1 : 0,
        version: 1, createdAt: now, updatedAt: now, deletedAt: null,
      }).execute();
      return this.requireGroup(transaction, id);
    });
  }

  renameGroup(id: string, name: string, version: number, executor?: Executor): Promise<WatchlistGroup> {
    return this.inTransaction(executor, async (transaction) => {
      const trimmed = name.trim();
      if (!trimmed) throw new ApiError("INVALID_WATCHLIST_NAME", "自选分组名称不能为空", 400);
      const updated = await transaction.updateTable("core.watchlist_group")
        .set(({ eb }) => ({ name: trimmed, version: eb("version", "+", 1), updatedAt: this.now() }))
        .where("id", "=", id).where("version", "=", version).returning("id").executeTakeFirst();
      if (!updated) throw await this.versionConflict(transaction, id);
      return this.requireGroup(transaction, id);
    });
  }

  addSymbol(id: string, symbol: string, executor?: Executor): Promise<WatchlistGroup> {
    return this.inTransaction(executor, async (transaction) => {
      await this.lockGroup(transaction, id);
      const normalized = normalizeSymbol(symbol);
      const last = await transaction.selectFrom("core.watchlist_symbol").select("orderIndex")
        .where("groupId", "=", id).orderBy("orderIndex", "desc").executeTakeFirst();
      await transaction.insertInto("core.watchlist_symbol").values({
        groupId: id, symbol: normalized, orderIndex: last ? Number(last.orderIndex) + 1 : 0, createdAt: this.now(),
      }).onConflict((conflict) => conflict.columns(["groupId", "symbol"]).doNothing()).execute();
      return this.requireGroup(transaction, id);
    });
  }

  removeSymbol(id: string, symbol: string, executor?: Executor): Promise<WatchlistGroup> {
    return this.inTransaction(executor, async (transaction) => {
      await this.lockGroup(transaction, id);
      await transaction.deleteFrom("core.watchlist_symbol").where("groupId", "=", id)
        .where("symbol", "=", normalizeSymbol(symbol)).execute();
      return this.requireGroup(transaction, id);
    });
  }

  removeGroup(id: string, executor?: Executor): Promise<WatchlistGroup> { return this.setDeleted(id, this.now(), executor); }
  restoreGroup(id: string, executor?: Executor): Promise<WatchlistGroup> { return this.setDeleted(id, null, executor); }

  moveGroup(id: string, targetIndex: number, executor?: Executor): Promise<void> {
    return this.inTransaction(executor, async (transaction) => {
      await sql`select pg_advisory_xact_lock(19370301)`.execute(transaction);
      const groups = await transaction.selectFrom("core.watchlist_group").select(["id", "orderIndex"])
        .where("deletedAt", "is", null).orderBy("orderIndex", "asc").orderBy("id", "asc").execute();
      const currentIndex = groups.findIndex((group) => group.id === id);
      if (currentIndex < 0) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
      const [moved] = groups.splice(currentIndex, 1);
      groups.splice(Math.max(0, Math.min(Math.trunc(targetIndex), groups.length)), 0, moved);
      for (const [index, group] of groups.entries()) {
        await transaction.updateTable("core.watchlist_group").set({ orderIndex: index, updatedAt: this.now() })
          .where("id", "=", group.id).execute();
      }
    });
  }

  private async read(deleted: boolean): Promise<WatchlistGroup[]> {
    const groups = await this.database.selectFrom("core.watchlist_group").selectAll()
      .where("deletedAt", deleted ? "is not" : "is", null).orderBy("orderIndex", "asc").orderBy("id", "asc").execute();
    const symbols = await this.database.selectFrom("core.watchlist_symbol").selectAll()
      .orderBy("orderIndex", "asc").orderBy("symbol", "asc").execute();
    return groups.map((group) => this.mapGroup(group, symbols.filter((entry) => entry.groupId === group.id).map((entry) => entry.symbol)));
  }

  private async requireGroup(executor: Kysely<Database> | Executor, id: string): Promise<WatchlistGroup> {
    const group = await executor.selectFrom("core.watchlist_group").selectAll().where("id", "=", id).executeTakeFirst();
    if (!group) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
    const symbols = await executor.selectFrom("core.watchlist_symbol").select("symbol").where("groupId", "=", id)
      .orderBy("orderIndex", "asc").orderBy("symbol", "asc").execute();
    return this.mapGroup(group, symbols.map(({ symbol }) => symbol));
  }

  private mapGroup(group: { id: string; name: string; orderIndex: number; version: number; deletedAt: Date | null }, symbols: string[]): WatchlistGroup {
    return { id: group.id, name: group.name, symbols, order: Number(group.orderIndex), version: group.version,
      deletedAt: group.deletedAt?.toISOString() };
  }

  private async lockGroup(transaction: Executor, id: string): Promise<void> {
    const group = await transaction.selectFrom("core.watchlist_group").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
    if (!group) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
  }

  private setDeleted(id: string, deletedAt: Date | null, executor?: Executor): Promise<WatchlistGroup> {
    return this.inTransaction(executor, async (transaction) => {
      const updated = await transaction.updateTable("core.watchlist_group")
        .set(({ eb }) => ({ deletedAt, version: eb("version", "+", 1), updatedAt: this.now() }))
        .where("id", "=", id).returning("id").executeTakeFirst();
      if (!updated) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
      return this.requireGroup(transaction, id);
    });
  }

  private async versionConflict(transaction: Executor, id: string): Promise<ApiError> {
    const exists = await transaction.selectFrom("core.watchlist_group").select("id").where("id", "=", id).executeTakeFirst();
    return exists ? new ApiError("VERSION_CONFLICT", "自选分组已被更新", 409, false, { latest: await this.requireGroup(transaction, id) }) : new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
  }

  private inTransaction<T>(executor: Executor | undefined, action: (transaction: Executor) => Promise<T>): Promise<T> {
    return executor ? action(executor) : this.database.transaction().execute(action);
  }
}
