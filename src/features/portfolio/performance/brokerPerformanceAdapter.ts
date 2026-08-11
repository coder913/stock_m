import type { LedgerEvent } from "../domain";
import type { PaperLedgerEventView } from "../../trading/paperPortfolioApiClient";

export interface BrokerPerformanceAdaptation {
  dataState: "fresh" | "unavailable";
  events: LedgerEvent[];
  notices: string[];
  inceptionDate?: string;
  cashHistoryComplete: boolean;
}

const decimalPattern = /^-?\d+(?:\.\d+)?$/;

function decimal(event: PaperLedgerEventView, field: "quantity" | "price" | "amount", required = false): number | undefined {
  const value = event[field];
  if (value === undefined) {
    if (required) throw new Error(`PAPER_LEDGER_FIELD_REQUIRED:${event.id}:${field}`);
    return undefined;
  }
  if (!decimalPattern.test(value)) throw new Error(`PAPER_LEDGER_DECIMAL_INVALID:${event.id}:${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`PAPER_LEDGER_DECIMAL_INVALID:${event.id}:${field}`);
  return parsed;
}

function requiredSymbol(event: PaperLedgerEventView): string {
  const symbol = event.symbol?.trim().toUpperCase();
  if (!symbol) throw new Error(`PAPER_LEDGER_FIELD_REQUIRED:${event.id}:symbol`);
  return symbol;
}

function adaptEvent(event: PaperLedgerEventView): LedgerEvent {
  const base = { id: event.id, type: event.eventType, occurredAt: event.occurredAt, source: "alpaca" as const, sourceEventId: event.remoteSourceId };
  if (event.eventType === "buy" || event.eventType === "sell") {
    return { ...base, type: event.eventType, symbol: requiredSymbol(event), quantity: Math.abs(decimal(event, "quantity", true)!), price: Math.abs(decimal(event, "price", true)!) };
  }
  if (event.eventType === "dividend") {
    return { ...base, type: "dividend", symbol: requiredSymbol(event), amount: Math.abs(decimal(event, "amount", true)!) };
  }
  if (event.eventType === "fee" || event.eventType === "deposit" || event.eventType === "withdrawal") {
    return { ...base, type: event.eventType, amount: Math.abs(decimal(event, "amount", true)!) };
  }
  return { ...base, type: "split", symbol: requiredSymbol(event), quantityMultiplier: Math.abs(decimal(event, "quantity", true)!) };
}

export function adaptBrokerPerformance(input: { activeDrift: boolean; events: PaperLedgerEventView[] }): BrokerPerformanceAdaptation {
  if (input.events.some((event) => event.source !== "alpaca-paper")) throw new Error("PAPER_LEDGER_SOURCE_REQUIRED");
  if (input.activeDrift) return { dataState: "unavailable", events: [], notices: ["Paper 对账不一致"], cashHistoryComplete: false };

  const ordered = [...input.events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  const unknownCount = ordered.filter((event) => event.eventType === "unknown").length;
  const events = ordered.filter((event) => event.eventType !== "unknown").map(adaptEvent);
  const firstTrade = events.find((event) => event.type === "buy" || event.type === "sell");
  const cashHistoryComplete = !firstTrade || events.some((event) => event.type === "deposit" && event.occurredAt <= firstTrade.occurredAt);

  return {
    dataState: "fresh",
    events,
    notices: unknownCount ? [`已忽略 ${unknownCount} 条无法识别的 Paper 活动`] : [],
    inceptionDate: events[0]?.occurredAt.slice(0, 10),
    cashHistoryComplete,
  };
}
