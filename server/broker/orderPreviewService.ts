import { randomUUID } from "node:crypto";
import type { OrderPreview, OrderPreviewClaims, PaperOrderDraft } from "../../shared/broker";
import { ApiError } from "../core/errors";

const scale = 100_000_000n;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

function decimal(value: string, code = "INVALID_ORDER_QUANTITY"): bigint {
  if (!decimalPattern.test(value)) throw new ApiError(code, "Decimal value is invalid", 400, false);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(8, "0"));
}

function format(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / scale}.${String(absolute % scale).padStart(8, "0")}`;
}

function multiply(left: bigint, right: bigint): bigint {
  return (left * right + scale / 2n) / scale;
}

export interface OrderPreviewDependencies {
  enabled: boolean;
  now: () => Date;
  loadAccount(): Promise<{ buyingPower: string; equity: string }>;
  loadAsset(symbol: string): Promise<{ symbol: string; status: string; tradable: boolean; fractionable: boolean }>;
  loadQuote(symbol: string): Promise<{ price: string; source: string; asOf: string; state: "fresh" | "stale" | "missing" | "unavailable" }>;
  loadPosition(symbol: string): Promise<{ quantity: string }>;
  hasActiveDrift(): Promise<boolean>;
  tokens: Pick<{ issue(claims: OrderPreviewClaims): string }, "issue">;
}

export class OrderPreviewService {
  constructor(private readonly dependencies: OrderPreviewDependencies) {}

  async preview(input: PaperOrderDraft): Promise<OrderPreview> {
    if (!this.dependencies.enabled) throw new ApiError("PAPER_TRADING_DISABLED", "Alpaca Paper trading is disabled", 409, false);
    if (await this.dependencies.hasActiveDrift()) throw new ApiError("BROKER_DRIFT_ACTIVE", "Broker drift must be reconciled before placing orders", 409, false);
    const symbol = input.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.-]+$/.test(symbol)) throw new ApiError("INVALID_ORDER_SYMBOL", "Order symbol is invalid", 400, false);
    const quantity = decimal(input.quantity);
    if (quantity <= 0n) throw new ApiError("INVALID_ORDER_QUANTITY", "Order quantity must be positive", 400, false);

    const [account, asset, quote, position] = await Promise.all([
      this.dependencies.loadAccount(),
      this.dependencies.loadAsset(symbol),
      this.dependencies.loadQuote(symbol),
      this.dependencies.loadPosition(symbol),
    ]);
    if (asset.status !== "active" || !asset.tradable) throw new ApiError("ASSET_NOT_TRADABLE", "Asset is not active and tradable", 409, false);
    const fractional = quantity % scale !== 0n;
    if (fractional && (!asset.fractionable || input.type !== "market" || input.timeInForce !== "day")) {
      throw new ApiError("FRACTIONAL_ORDER_UNSUPPORTED", "Fractional shares require a fractionable market DAY order", 400, false);
    }
    if (quote.state !== "fresh") throw new ApiError("FRESH_QUOTE_REQUIRED", "A fresh quote is required", 409, true);
    const quotePrice = decimal(quote.price, "INVALID_QUOTE_PRICE");
    if (quotePrice <= 0n) throw new ApiError("INVALID_QUOTE_PRICE", "Quote price must be positive", 409, true);

    let limitPrice: string | undefined;
    if (input.type === "limit") {
      if (input.limitPrice === undefined) throw new ApiError("LIMIT_PRICE_REQUIRED", "A positive limit price is required", 400, false);
      const parsedLimit = decimal(input.limitPrice, "LIMIT_PRICE_REQUIRED");
      if (parsedLimit <= 0n) throw new ApiError("LIMIT_PRICE_REQUIRED", "A positive limit price is required", 400, false);
      limitPrice = format(parsedLimit);
    } else if (input.limitPrice !== undefined) {
      throw new ApiError("MARKET_ORDER_LIMIT_PRICE_FORBIDDEN", "Market orders cannot include a limit price", 400, false);
    }

    const currentPosition = decimal(position.quantity, "INVALID_POSITION");
    if (input.side === "sell" && quantity > currentPosition) {
      throw new ApiError("INSUFFICIENT_PAPER_POSITION", "Sell quantity exceeds the available long position", 409, false);
    }
    const executionReference = limitPrice === undefined ? quotePrice : decimal(limitPrice);
    const estimatedNotionalValue = multiply(quantity, executionReference);
    const buyingPower = decimal(account.buyingPower, "INVALID_BUYING_POWER");
    if (input.side === "buy" && estimatedNotionalValue > buyingPower) {
      throw new ApiError("INSUFFICIENT_BUYING_POWER", "Estimated notional exceeds Paper buying power", 409, false);
    }
    const estimatedPosition = input.side === "buy" ? currentPosition + quantity : currentPosition - quantity;
    const normalizedOrder: PaperOrderDraft = {
      symbol,
      side: input.side,
      quantity: format(quantity),
      type: input.type,
      timeInForce: input.timeInForce,
      ...(limitPrice === undefined ? {} : { limitPrice }),
    };
    const previewId = randomUUID();
    const expiresAt = new Date(this.dependencies.now().getTime() + 60_000).toISOString();
    const claims = { previewId, expiresAt, normalizedOrder };
    const equity = decimal(account.equity, "INVALID_ACCOUNT_EQUITY");
    const positionNotional = multiply(currentPosition, quotePrice);
    return {
      ...claims,
      estimatedNotional: format(estimatedNotionalValue),
      quote: { price: format(quotePrice), source: quote.source, asOf: quote.asOf },
      buyingPower: format(buyingPower),
      positionBefore: format(currentPosition),
      estimatedPositionAfter: format(estimatedPosition),
      ...(equity > 0n ? {
        concentrationBefore: Number(positionNotional * 10_000n / equity) / 100,
        estimatedConcentrationAfter: Number(multiply(estimatedPosition, quotePrice) * 10_000n / equity) / 100,
      } : {}),
      warnings: input.type === "market"
        ? ["Paper execution price is not guaranteed"]
        : ["A limit order may not execute"],
      token: this.dependencies.tokens.issue(claims),
    };
  }
}
