const storageKey = "stock_m:watchlists:v1";
import type { WatchlistGroup } from "../../../shared/watchlist";
export type { WatchlistGroup } from "../../../shared/watchlist";

const copy = (group: WatchlistGroup): WatchlistGroup => ({ ...group, symbols: [...group.symbols] });

export class WatchlistRepository {
  constructor(private readonly storage: Storage) {}

  list(): WatchlistGroup[] { return this.read().filter((group) => !group.deletedAt).sort((a, b) => a.order - b.order).map(copy); }
  listDeleted(): WatchlistGroup[] { return this.read().filter((group) => group.deletedAt).map(copy); }

  createGroup(name: string): WatchlistGroup {
    const group: WatchlistGroup = { id: globalThis.crypto?.randomUUID?.() ?? `group-${Date.now()}`, name: name.trim(), symbols: [], order: this.list().length, version: 1 };
    this.write([...this.read(), group]);
    return copy(group);
  }

  renameGroup(id: string, name: string): WatchlistGroup { return this.update(id, (group) => ({ ...group, name: name.trim(), version: group.version + 1 })); }
  addSymbol(id: string, symbol: string): WatchlistGroup { return this.update(id, (group) => ({ ...group, symbols: group.symbols.includes(symbol.toUpperCase()) ? group.symbols : [...group.symbols, symbol.toUpperCase()] })); }
  removeSymbol(id: string, symbol: string): WatchlistGroup { return this.update(id, (group) => ({ ...group, symbols: group.symbols.filter((item) => item !== symbol.toUpperCase()) })); }
  removeGroup(id: string): WatchlistGroup { return this.update(id, (group) => ({ ...group, deletedAt: new Date().toISOString() })); }
  restoreGroup(id: string): WatchlistGroup { return this.update(id, (group) => ({ ...group, deletedAt: undefined })); }

  moveGroup(id: string, targetIndex: number): void {
    const active = this.list();
    const currentIndex = active.findIndex((group) => group.id === id);
    if (currentIndex === -1) throw new Error("未找到自选分组");
    const [group] = active.splice(currentIndex, 1);
    active.splice(Math.max(0, Math.min(targetIndex, active.length)), 0, group);
    const orders = new Map(active.map((item, index) => [item.id, index]));
    this.write(this.read().map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item));
  }

  private update(id: string, change: (group: WatchlistGroup) => WatchlistGroup): WatchlistGroup {
    const groups = this.read(); const index = groups.findIndex((group) => group.id === id);
    if (index === -1) throw new Error("未找到自选分组");
    groups[index] = change(groups[index]); this.write(groups); return copy(groups[index]);
  }
  private read(): WatchlistGroup[] { try { return (JSON.parse(this.storage.getItem(storageKey) || "[]") as WatchlistGroup[]).map((group) => ({ ...group, version: group.version ?? 1 })); } catch { return []; } }
  private write(groups: WatchlistGroup[]): void { this.storage.setItem(storageKey, JSON.stringify(groups)); }
}
