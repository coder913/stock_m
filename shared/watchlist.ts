export interface WatchlistGroup {
  id: string;
  name: string;
  symbols: string[];
  order: number;
  version: number;
  deletedAt?: string;
}

export interface AsyncWatchlistRepository {
  list(): Promise<WatchlistGroup[]>;
  listDeleted(): Promise<WatchlistGroup[]>;
  createGroup(name: string, idempotencyKey?: string): Promise<WatchlistGroup>;
  renameGroup(id: string, name: string, version: number, idempotencyKey?: string): Promise<WatchlistGroup>;
  addSymbol(id: string, symbol: string, idempotencyKey?: string): Promise<WatchlistGroup>;
  removeSymbol(id: string, symbol: string, idempotencyKey?: string): Promise<WatchlistGroup>;
  removeGroup(id: string, idempotencyKey?: string): Promise<WatchlistGroup>;
  restoreGroup(id: string, idempotencyKey?: string): Promise<WatchlistGroup>;
  moveGroup(id: string, targetIndex: number, idempotencyKey?: string): Promise<void>;
}
