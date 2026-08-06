import type { LedgerEvent, LedgerEventInput, MigrationResult } from "./domain";

const key = "stock_m:portfolio-ledger:v1";
const migrationKey = "stock_m:portfolio-ledger:migrated-orders:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));

interface LegacyOrder { symbol: string; quantity: number; price: number; thesisVersionId: string; }

export class PortfolioLedger {
  constructor(private readonly storage: Storage) {}

  list(): LedgerEvent[] { return this.read().map(immutable); }

  append(input: LedgerEventInput): LedgerEvent {
    this.validate(input);
    if (input.type === "sell" && (input.quantity ?? 0) > this.availableQuantity(input.symbol!)) {
      throw new Error(`可卖数量为 ${this.availableQuantity(input.symbol!)}`);
    }
    const event = immutable({ ...clone(input), id: globalThis.crypto?.randomUUID?.() ?? `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    this.write([...this.read(), event]);
    return event;
  }

  migrateLegacyOrders(): MigrationResult {
    if (this.storage.getItem(migrationKey)) return { migrated: 0, skipped: true };
    const orders = this.safeRead<LegacyOrder>("stock_m:orders");
    const events = orders.map((order, index) => immutable({
      id: `legacy-order-${index}`,
      type: "buy" as const,
      symbol: order.symbol.toUpperCase(),
      quantity: order.quantity,
      price: order.price,
      thesisVersionId: order.thesisVersionId,
      occurredAt: `2026-08-01T00:00:${String(index).padStart(2, "0")}Z`,
    }));
    this.write([...this.read(), ...events]);
    this.storage.setItem(migrationKey, "1");
    return { migrated: events.length, skipped: false };
  }

  private validate(input: LedgerEventInput): void {
    if (!input.occurredAt) throw new Error("必须提供发生时间");
    if (input.type === "buy" || input.type === "sell") {
      if (!input.symbol || !input.quantity || input.quantity <= 0 || !input.price || input.price <= 0) throw new Error("数量和价格必须大于零");
      if (input.type === "buy" && !input.thesisVersionId) throw new Error("必须关联投资逻辑");
      if (input.type === "sell" && !input.thesisVersionId && !input.reason) throw new Error("卖出必须关联投资逻辑或调整原因");
      return;
    }
    if (!input.amount || input.amount <= 0) throw new Error("金额必须大于零");
    if (!input.reason) throw new Error("必须填写调整原因");
  }

  private availableQuantity(symbol: string): number {
    return this.read().filter((item) => item.symbol === symbol).reduce((quantity, item) => quantity + (item.type === "buy" ? item.quantity ?? 0 : item.type === "sell" ? -(item.quantity ?? 0) : 0), 0);
  }
  private read(): LedgerEvent[] { return this.safeRead<LedgerEvent>(key); }
  private safeRead<T>(storageKey: string): T[] { try { return JSON.parse(this.storage.getItem(storageKey) || "[]") as T[]; } catch { return []; } }
  private write(events: LedgerEvent[]): void { this.storage.setItem(key, JSON.stringify(events)); }
}
