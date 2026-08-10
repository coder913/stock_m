import type { SavedScreen, SavedScreenInput, ScreenerCondition } from "../../../shared/discoveryState";
export type { SavedScreenInput } from "../../../shared/discoveryState";

const storageKey = "stock_m:saved-screens:v1";
const copyConditions = (conditions: ScreenerCondition[]) => conditions.map((condition) => ({
  ...condition,
  value: Array.isArray(condition.value) ? [...condition.value] as [number, number] : condition.value,
}));
const copy = (screen: SavedScreen): SavedScreen => ({ ...screen, version: screen.version ?? 1, conditions: copyConditions(screen.conditions), sort: { ...screen.sort } });

export class SavedScreenRepository {
  constructor(private readonly storage: Storage) {}

  list(): SavedScreen[] {
    return this.read().map(copy);
  }

  save(input: SavedScreenInput): SavedScreen {
    const now = new Date().toISOString();
    const saved: SavedScreen = { id: this.createId(), name: input.name.trim(), conditions: copyConditions(input.conditions), sort: { ...input.sort }, version: 1, createdAt: now, updatedAt: now };
    this.write([...this.read(), saved]);
    return copy(saved);
  }

  rename(id: string, name: string): SavedScreen {
    return this.update(id, (screen) => ({ ...screen, name: name.trim(), version: (screen.version ?? 1) + 1 }));
  }

  duplicate(id: string): SavedScreen {
    const source = this.require(id);
    return this.save({ name: `${source.name}副本`, conditions: source.conditions, sort: source.sort });
  }

  remove(id: string): void {
    this.write(this.read().filter((screen) => screen.id !== id));
  }

  private update(id: string, change: (screen: SavedScreen) => SavedScreen): SavedScreen {
    const current = this.read();
    const index = current.findIndex((screen) => screen.id === id);
    if (index === -1) throw new Error("未找到保存的筛选器");
    const updated = { ...change(current[index]), updatedAt: new Date().toISOString() };
    current[index] = updated;
    this.write(current);
    return copy(updated);
  }

  private require(id: string): SavedScreen {
    const screen = this.read().find((item) => item.id === id);
    if (!screen) throw new Error("未找到保存的筛选器");
    return copy(screen);
  }

  private read(): SavedScreen[] {
    const raw = this.storage.getItem(storageKey);
    if (!raw) return [];
    try { return (JSON.parse(raw) as SavedScreen[]).map((screen) => ({ ...screen, version: screen.version ?? 1 })); } catch { return []; }
  }

  private write(screens: SavedScreen[]): void {
    this.storage.setItem(storageKey, JSON.stringify(screens));
  }

  private createId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `screen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
