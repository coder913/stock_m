import type { AsyncWatchlistRepository, WatchlistGroup } from "../../../shared/watchlist";
import { ApiClient } from "../../app/apiClient";

const key = (provided?: string) => provided ?? globalThis.crypto.randomUUID();

export class WatchlistApiRepository implements AsyncWatchlistRepository {
  constructor(private readonly client = new ApiClient("/api/v1")) {}

  list(): Promise<WatchlistGroup[]> { return this.client.requestJson({ path: "/watchlists" }); }
  listDeleted(): Promise<WatchlistGroup[]> { return this.client.requestJson({ path: "/watchlists?deleted=true" }); }
  createGroup(name: string, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "POST", path: "/watchlists", body: { name }, idempotencyKey: key(idempotencyKey) });
  }
  renameGroup(id: string, name: string, version: number, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "PATCH", path: `/watchlists/${encodeURIComponent(id)}`, body: { name, version }, idempotencyKey: key(idempotencyKey) });
  }
  addSymbol(id: string, symbol: string, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "POST", path: `/watchlists/${encodeURIComponent(id)}/symbols`, body: { symbol: symbol.trim().toUpperCase() }, idempotencyKey: key(idempotencyKey) });
  }
  removeSymbol(id: string, symbol: string, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "DELETE", path: `/watchlists/${encodeURIComponent(id)}/symbols/${encodeURIComponent(symbol.trim().toUpperCase())}`, idempotencyKey: key(idempotencyKey) });
  }
  removeGroup(id: string, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "DELETE", path: `/watchlists/${encodeURIComponent(id)}`, idempotencyKey: key(idempotencyKey) });
  }
  restoreGroup(id: string, idempotencyKey?: string): Promise<WatchlistGroup> {
    return this.client.requestJson({ method: "POST", path: `/watchlists/${encodeURIComponent(id)}/restore`, idempotencyKey: key(idempotencyKey) });
  }
  async moveGroup(id: string, targetIndex: number, idempotencyKey?: string): Promise<void> {
    await this.client.requestJson({ method: "POST", path: `/watchlists/${encodeURIComponent(id)}/move`, body: { targetIndex }, idempotencyKey: key(idempotencyKey) });
  }
}
