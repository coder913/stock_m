import type { BrokerActivity } from "../../shared/broker";
import {
  MONEY_DECIMAL_SCALE,
  QUANTITY_DECIMAL_SCALE,
  formatFixedDecimal,
  multiplyFixedDecimal,
  negateFixedDecimal,
  parseFixedDecimal,
} from "./fixedDecimal";

export interface BrokerLedgerInput {
  remoteSourceId: string;
  eventType: "buy" | "sell" | "dividend" | "fee" | "split" | "deposit" | "withdrawal" | "unknown";
  symbol?: string;
  amount?: string;
  quantity?: string;
  price?: string;
  quantityMultiplier?: string;
  occurredAt: string;
  provenance: unknown;
}

function normalize(value: string | undefined, scale: number): string | undefined {
  return value === undefined ? undefined : formatFixedDecimal(parseFixedDecimal(value, scale), scale);
}

function validateFillDecimals(quantity: string | undefined, price: string | undefined): { quantity: string; price: string } {
  if (quantity === undefined || price === undefined) {
    throw new Error("INVALID_FILL_DECIMAL:quantity and price are required");
  }
  if (parseFixedDecimal(quantity, QUANTITY_DECIMAL_SCALE) <= 0n || parseFixedDecimal(price, MONEY_DECIMAL_SCALE) <= 0n) {
    throw new Error("INVALID_FILL_DECIMAL:quantity and price must be positive");
  }
  return { quantity, price };
}

function fillAmount(quantity: string, price: string, side: "buy" | "sell"): string {
  const notional = multiplyFixedDecimal(quantity, price, {
    leftScale: QUANTITY_DECIMAL_SCALE,
    rightScale: MONEY_DECIMAL_SCALE,
    resultScale: MONEY_DECIMAL_SCALE,
  });
  return side === "buy" ? negateFixedDecimal(notional) : notional;
}

export function mapBrokerActivity(activity: BrokerActivity): BrokerLedgerInput {
  const type = activity.type.toUpperCase();
  let eventType: BrokerLedgerInput["eventType"] = "unknown";
  if (type === "FILL" && activity.side) eventType = activity.side;
  else if (type === "DIV" || type === "DIVIDEND") eventType = "dividend";
  else if (type.includes("FEE")) eventType = "fee";
  else if (type === "SPLIT") eventType = "split";
  else if (type === "CSD" || type === "DEPOSIT") eventType = "deposit";
  else if (type === "CSW" || type === "WITHDRAWAL") eventType = "withdrawal";

  const normalizedQuantity = normalize(activity.quantity, QUANTITY_DECIMAL_SCALE);
  const normalizedPrice = normalize(activity.price, MONEY_DECIMAL_SCALE);
  let amount = normalize(activity.amount, MONEY_DECIMAL_SCALE);
  if (eventType === "buy" || eventType === "sell") {
    const fill = validateFillDecimals(normalizedQuantity, normalizedPrice);
    if (amount === undefined) amount = fillAmount(fill.quantity, fill.price, eventType);
  }
  return {
    remoteSourceId: `activity:${activity.remoteActivityId}`,
    eventType,
    symbol: activity.symbol,
    amount,
    quantity: normalizedQuantity,
    price: normalizedPrice,
    quantityMultiplier: eventType === "split" ? normalizedQuantity : undefined,
    occurredAt: activity.occurredAt,
    provenance: activity.raw,
  };
}
