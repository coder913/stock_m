import type { LedgerEvent, LedgerEventInput, MigrationResult } from "./domain";
import { toNewYorkMarketDate } from "./portfolioSettingsRepository";

const key = "stock_m:portfolio-ledger:v1";
const migrationKey = "stock_m:portfolio-ledger:migrated-orders:v1";
const clone = <T,>(value: T): T => structuredClone(value);
const immutable = <T extends object>(value: T): T => Object.freeze(clone(value));
const round8 = (value: number): number => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

interface LegacyOrder { symbol: string; quantity: number; price: number; thesisVersionId: string; }

const eventMarketDate = (event: LedgerEvent): string => event.type === "split"
  ? event.occurredAt.slice(0, 10)
  : toNewYorkMarketDate(event.occurredAt);

export const sortLedgerEvents = (events: LedgerEvent[]): LedgerEvent[] => events
  .map((event, index) => ({ event, index, marketDate: eventMarketDate(event) }))
  .sort((left, right) => (
    left.marketDate.localeCompare(right.marketDate)
    || Number(right.event.type === "split") - Number(left.event.type === "split")
    || left.event.occurredAt.localeCompare(right.event.occurredAt)
    || left.index - right.index
  ))
  .map(({ event }) => event);

export class PortfolioLedger {
  constructor(
    private readonly storage: Storage,
    private readonly getInitialCash: () => number = () => 10_000,
  ) {}

  list(): LedgerEvent[] { return this.read().map(immutable); }

  append(input: LedgerEventInput): LedgerEvent {
    this.validate(input);
    if (input.type === "split") {
      const existing = this.read().find((event) => (
        event.type === "split" && event.sourceEventId === input.sourceEventId
      ));
      if (existing) return immutable(existing);
    }
    if (input.type === "sell" && (input.quantity ?? 0) > this.availableQuantity(input.symbol!)) {
      throw new Error(`可卖数量为 ${this.availableQuantity(input.symbol!)}`);
    }
    if (input.type === "withdrawal") {
      const availableCash = this.availableCashAt(input.occurredAt);
      if ((input.amount ?? 0) > availableCash) throw new Error(`可用现金为 ${availableCash}`);
    }
    const event = immutable({
      ...clone(input),
      id: globalThis.crypto?.randomUUID?.() ?? `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
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

  availableQuantity(symbol: string): number {
    return sortLedgerEvents(this.read())
      .filter((item) => item.symbol === symbol)
      .reduce((quantity, item) => {
        if (item.type === "buy") return round8(quantity + (item.quantity ?? 0));
        if (item.type === "sell") return round8(quantity - (item.quantity ?? 0));
        if (item.type === "split") return round8(quantity * (item.quantityMultiplier ?? 1));
        return quantity;
      }, 0);
  }

  private validate(input: LedgerEventInput): void {
    if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("必须提供有效发生时间");
    if (input.type === "buy" || input.type === "sell") {
      if (!input.symbol || !input.quantity || !Number.isFinite(input.quantity) || input.quantity <= 0 || !input.price || !Number.isFinite(input.price) || input.price <= 0) throw new Error("数量和价格必须大于零");
      if (input.type === "buy" && !input.thesisVersionId) throw new Error("必须关联投资逻辑");
      if (input.type === "sell" && !input.thesisVersionId && !input.reason) throw new Error("卖出必须关联投资逻辑或调整原因");
      return;
    }
    if (input.type === "split") {
      const expectedMultiplier = (input.newRate ?? 0) / (input.oldRate ?? 0);
      if (
        !input.symbol
        || !input.oldRate
        || !input.newRate
        || !input.quantityMultiplier
        || !Number.isFinite(input.oldRate)
        || !Number.isFinite(input.newRate)
        || !Number.isFinite(input.quantityMultiplier)
        || input.oldRate <= 0
        || input.newRate <= 0
        || input.quantityMultiplier <= 0
        || Math.abs(input.quantityMultiplier - expectedMultiplier) > 1e-10
      ) throw new Error("拆股比例无效");
      if ((input.source !== "alpaca" && input.source !== "manual") || !input.sourceEventId?.trim()) throw new Error("拆股来源无效");
      if (!input.confirmedAt || Number.isNaN(Date.parse(input.confirmedAt))) throw new Error("拆股确认时间无效");
      return;
    }
    if (!input.amount || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error("金额必须大于零");
    if (!input.reason?.trim()) throw new Error("必须填写调整原因");
  }

  private availableCashAt(occurredAt: string): number {
    return this.read()
      .filter((event) => event.occurredAt <= occurredAt)
      .reduce((cash, event) => {
        if (event.type === "buy") return cash - (event.quantity ?? 0) * (event.price ?? 0);
        if (event.type === "sell") return cash + (event.quantity ?? 0) * (event.price ?? 0);
        if (event.type === "dividend" || event.type === "deposit") return cash + (event.amount ?? 0);
        if (event.type === "fee" || event.type === "withdrawal") return cash - (event.amount ?? 0);
        return cash;
      }, this.getInitialCash());
  }

  private read(): LedgerEvent[] { return this.safeRead<LedgerEvent>(key); }
  private safeRead<T>(storageKey: string): T[] { try { return JSON.parse(this.storage.getItem(storageKey) || "[]") as T[]; } catch { return []; } }
  private write(events: LedgerEvent[]): void { this.storage.setItem(key, JSON.stringify(events)); }
}
