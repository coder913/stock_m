const storageKey = "stock_m:user-universe:v1";
type State = { addedSymbols: string[]; removedDefaultSymbols: string[] };
const normalize = (symbol: string) => { const value = symbol.trim().toUpperCase(); if (!/^[A-Z0-9.-]+$/.test(value)) throw new Error("股票代码格式无效"); return value; };
export class UniverseRepository {
  constructor(private readonly storage: Storage) {}
  list(defaultSymbols: string[]) { const state = this.read(); return [...defaultSymbols.filter((symbol) => !state.removedDefaultSymbols.includes(symbol)), ...state.addedSymbols.filter((symbol) => !defaultSymbols.includes(symbol))]; }
  add(symbol: string) { const value = normalize(symbol); const state = this.read(); if (!state.addedSymbols.includes(value)) state.addedSymbols.push(value); state.removedDefaultSymbols = state.removedDefaultSymbols.filter((item) => item !== value); this.write(state); }
  remove(symbol: string) { const value = normalize(symbol); const state = this.read(); state.addedSymbols = state.addedSymbols.filter((item) => item !== value); if (!state.removedDefaultSymbols.includes(value)) state.removedDefaultSymbols.push(value); this.write(state); }
  restore(symbol: string) { const value = normalize(symbol); const state = this.read(); state.removedDefaultSymbols = state.removedDefaultSymbols.filter((item) => item !== value); this.write(state); }
  private read(): State { try { const state = JSON.parse(this.storage.getItem(storageKey) || "{}"); return { addedSymbols: state.addedSymbols ?? [], removedDefaultSymbols: state.removedDefaultSymbols ?? [] }; } catch { return { addedSymbols: [], removedDefaultSymbols: [] }; } }
  private write(state: State) { this.storage.setItem(storageKey, JSON.stringify(state)); }
}
