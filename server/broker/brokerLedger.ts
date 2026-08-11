import {
  MONEY_DECIMAL_SCALE,
  QUANTITY_DECIMAL_SCALE,
  formatFixedDecimal,
  multiplyFixedDecimalValues,
  parseFixedDecimal,
  subtractFixedDecimal,
} from "./fixedDecimal";

export interface ReplayEvent {
  remoteSourceId: string;
  eventType: "buy" | "sell" | "dividend" | "fee" | "deposit" | "withdrawal" | "split" | "unknown";
  symbol?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  quantityMultiplier?: string;
}

function quantity(value: string | undefined): bigint {
  return value === undefined ? 0n : parseFixedDecimal(value, QUANTITY_DECIMAL_SCALE);
}

export function replayBrokerPortfolio(events: ReplayEvent[]) {
  let cash = 0n;
  const positions = new Map<string, bigint>();
  for (const event of events) {
    if (event.amount !== undefined) cash += parseFixedDecimal(event.amount);
    if (event.symbol && (event.eventType === "buy" || event.eventType === "sell")) {
      const delta = quantity(event.quantity) * (event.eventType === "buy" ? 1n : -1n);
      positions.set(event.symbol, (positions.get(event.symbol) ?? 0n) + delta);
    }
    if (event.symbol && event.eventType === "split") {
      positions.set(event.symbol, multiplyFixedDecimalValues(
        positions.get(event.symbol) ?? 0n,
        quantity(event.quantityMultiplier),
        { leftScale: QUANTITY_DECIMAL_SCALE, rightScale: QUANTITY_DECIMAL_SCALE, resultScale: QUANTITY_DECIMAL_SCALE },
      ));
    }
  }
  return {
    cash: formatFixedDecimal(cash),
    positions: [...positions]
      .filter(([, quantity]) => quantity !== 0n)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([symbol, value]) => ({ symbol, quantity: formatFixedDecimal(value, QUANTITY_DECIMAL_SCALE) })),
    provenance: events.map((event) => event.remoteSourceId),
  };
}

export function subtractDecimal(left: string, right: string): string {
  return subtractFixedDecimal(left, right, MONEY_DECIMAL_SCALE);
}

export function subtractQuantity(left: string, right: string): string {
  return subtractFixedDecimal(left, right, QUANTITY_DECIMAL_SCALE);
}
