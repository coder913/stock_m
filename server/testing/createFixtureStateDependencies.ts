import { ApiError } from "../core/errors";
import type { StateDiscoveryRouteDependencies } from "../routes/stateDiscoveryRoutes";
import type { SavedScreen, SavedScreenInput, UserUniverseState } from "../../shared/discoveryState";
import type { WatchlistGroup } from "../../shared/watchlist";

const cloneGroup = (group: WatchlistGroup): WatchlistGroup => ({ ...group, symbols: [...group.symbols] });
const cloneScreen = (screen: SavedScreen): SavedScreen => ({ ...screen, conditions: screen.conditions.map((condition) => ({ ...condition })), sort: { ...screen.sort } });

export function createFixtureStateDependencies(): StateDiscoveryRouteDependencies {
  let groups: WatchlistGroup[] = [];
  let screens: SavedScreen[] = [];
  let universe: UserUniverseState = { addedSymbols: [], removedDefaultSymbols: [], version: 0 };
  let groupSequence = 0;
  let screenSequence = 0;
  const idempotency = new Map<string, { fingerprint: string; response: { statusCode: number; body: unknown } }>();

  const watchlists = {
    async list() { return groups.filter((group) => !group.deletedAt).sort((a, b) => a.order - b.order).map(cloneGroup); },
    async listDeleted() { return groups.filter((group) => group.deletedAt).map(cloneGroup); },
    async createGroup(name: string) {
      const group: WatchlistGroup = { id: `fixture-group-${++groupSequence}`, name: name.trim(), symbols: [], order: groups.filter((item) => !item.deletedAt).length, version: 1 };
      groups.push(group); return cloneGroup(group);
    },
    async renameGroup(id: string, name: string, version: number) {
      const group = requireGroup(id); if (group.version !== version) throw new ApiError("VERSION_CONFLICT", "自选分组已被更新", 409);
      group.name = name.trim(); group.version += 1; return cloneGroup(group);
    },
    async addSymbol(id: string, symbol: string) { const group = requireGroup(id); const normalized = symbol.toUpperCase(); if (!group.symbols.includes(normalized)) group.symbols.push(normalized); return cloneGroup(group); },
    async removeSymbol(id: string, symbol: string) { const group = requireGroup(id); group.symbols = group.symbols.filter((item) => item !== symbol.toUpperCase()); return cloneGroup(group); },
    async removeGroup(id: string) { const group = requireGroup(id); group.deletedAt = new Date().toISOString(); group.version += 1; return cloneGroup(group); },
    async restoreGroup(id: string) { const group = requireGroup(id); delete group.deletedAt; group.version += 1; return cloneGroup(group); },
    async moveGroup(id: string, targetIndex: number) {
      const active = groups.filter((group) => !group.deletedAt).sort((a, b) => a.order - b.order);
      const index = active.findIndex((group) => group.id === id); if (index < 0) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404);
      const [group] = active.splice(index, 1); active.splice(Math.max(0, Math.min(targetIndex, active.length)), 0, group);
      active.forEach((item, order) => { item.order = order; });
    },
  };
  function requireGroup(id: string): WatchlistGroup {
    const group = groups.find((item) => item.id === id); if (!group) throw new ApiError("WATCHLIST_NOT_FOUND", "未找到自选分组", 404); return group;
  }

  const discovery = {
    async getUniverseState() { return { ...universe, addedSymbols: [...universe.addedSymbols], removedDefaultSymbols: [...universe.removedDefaultSymbols] }; },
    async addUniverseSymbol(symbol: string, version: number) { return changeUniverse(symbol, "add", version); },
    async removeUniverseSymbol(symbol: string, version: number) { return changeUniverse(symbol, "remove", version); },
    async restoreUniverseSymbol(symbol: string, version: number) { return changeUniverse(symbol, "restore", version); },
    async listScreens() { return screens.map(cloneScreen); },
    async createScreen(input: SavedScreenInput) {
      const now = new Date().toISOString();
      const screen: SavedScreen = { ...input, id: `fixture-screen-${++screenSequence}`, version: 1, createdAt: now, updatedAt: now };
      screens.push(screen); return cloneScreen(screen);
    },
    async renameScreen(id: string, name: string, version: number) {
      const screen = requireScreen(id); if (screen.version !== version) throw new ApiError("VERSION_CONFLICT", "保存的筛选器已被更新", 409);
      screen.name = name.trim(); screen.version += 1; screen.updatedAt = new Date().toISOString(); return cloneScreen(screen);
    },
    async duplicateScreen(id: string) { const source = requireScreen(id); return this.createScreen({ name: `${source.name}副本`, conditions: source.conditions, sort: source.sort }); },
    async removeScreen(id: string, version: number) { const screen = requireScreen(id); if (screen.version !== version) throw new ApiError("VERSION_CONFLICT", "保存的筛选器已被更新", 409); screens = screens.filter((item) => item.id !== id); },
  };
  function requireScreen(id: string): SavedScreen { const screen = screens.find((item) => item.id === id); if (!screen) throw new ApiError("SAVED_SCREEN_NOT_FOUND", "未找到保存的筛选器", 404); return screen; }
  function changeUniverse(symbol: string, action: "add" | "remove" | "restore", version: number): UserUniverseState {
    if (universe.version !== version) throw new ApiError("VERSION_CONFLICT", "用户股票池已被更新", 409);
    const normalized = symbol.toUpperCase();
    universe.addedSymbols = universe.addedSymbols.filter((item) => item !== normalized);
    universe.removedDefaultSymbols = universe.removedDefaultSymbols.filter((item) => item !== normalized);
    if (action === "add") universe.addedSymbols.push(normalized);
    if (action === "remove") universe.removedDefaultSymbols.push(normalized);
    universe.version += 1; return { ...universe, addedSymbols: [...universe.addedSymbols], removedDefaultSymbols: [...universe.removedDefaultSymbols] };
  }

  const database = { transaction: () => ({ execute: (command: (transaction: never) => Promise<unknown>) => command({} as never) }) };
  const store = {
    async execute(_transaction: unknown, key: string, fingerprint: string, command: () => Promise<{ statusCode: number; body: unknown }>) {
      const existing = idempotency.get(key);
      if (existing) { if (existing.fingerprint !== fingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", "幂等键冲突", 409); return existing.response; }
      const response = await command(); if (response.statusCode < 500) idempotency.set(key, { fingerprint, response }); return response;
    },
  };
  return { database, idempotency: store, outbox: { append: async () => undefined }, discovery, watchlists } as unknown as StateDiscoveryRouteDependencies;
}
