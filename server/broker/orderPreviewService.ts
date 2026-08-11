import { randomUUID } from "node:crypto";
import type { OrderPreview, OrderPreviewClaims, PaperOrderDraft } from "../../shared/broker";
import { ApiError } from "../core/errors";
import {
  MONEY_DECIMAL_SCALE,
  QUANTITY_DECIMAL_SCALE,
  formatFixedDecimal,
  multiplyFixedDecimalValues,
  parseFixedDecimal,
} from "./fixedDecimal";

const quantityFactor = 10n ** BigInt(QUANTITY_DECIMAL_SCALE);

function decimal(value: string, code: string, scale: number): bigint {
  try { return parseFixedDecimal(value, scale); }
  catch { throw new ApiError(code, "Decimal value is invalid", 400, false); }
}

function money(value: string, code: string): bigint {
  return decimal(value, code, MONEY_DECIMAL_SCALE);
}

function quantity(value: string, code = "INVALID_ORDER_QUANTITY"): bigint {
  return decimal(value, code, QUANTITY_DECIMAL_SCALE);
}

function multiplyQuantityPrice(quantityValue: bigint, priceValue: bigint): bigint {
  return multiplyFixedDecimalValues(quantityValue, priceValue, {
    leftScale: QUANTITY_DECIMAL_SCALE,
    rightScale: MONEY_DECIMAL_SCALE,
    resultScale: MONEY_DECIMAL_SCALE,
  });
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
    const orderQuantity = quantity(input.quantity);
    if (orderQuantity <= 0n) throw new ApiError("INVALID_ORDER_QUANTITY", "Order quantity must be positive", 400, false);

    const [account, asset, quote, position] = await Promise.all([
      this.dependencies.loadAccount(),
      this.dependencies.loadAsset(symbol),
      this.dependencies.loadQuote(symbol),
      this.dependencies.loadPosition(symbol),
    ]);
    if (asset.status !== "active" || !asset.tradable) throw new ApiError("ASSET_NOT_TRADABLE", "Asset is not active and tradable", 409, false);
    const fractional = orderQuantity % quantityFactor !== 0n;
    if (fractional && (!asset.fractionable || input.type !== "market" || input.timeInForce !== "day")) {
      throw new ApiError("FRACTIONAL_ORDER_UNSUPPORTED", "Fractional shares require a fractionable market DAY order", 400, false);
    }
    if (quote.state !== "fresh") throw new ApiError("FRESH_QUOTE_REQUIRED", "A fresh quote is required", 409, true);
    const quotePrice = money(quote.price, "INVALID_QUOTE_PRICE");
    if (quotePrice <= 0n) throw new ApiError("INVALID_QUOTE_PRICE", "Quote price must be positive", 409, true);

    let limitPrice: string | undefined;
    if (input.type === "limit") {
      if (input.limitPrice === undefined) throw new ApiError("LIMIT_PRICE_REQUIRED", "A positive limit price is required", 400, false);
      const parsedLimit = money(input.limitPrice, "LIMIT_PRICE_REQUIRED");
      if (parsedLimit <= 0n) throw new ApiError("LIMIT_PRICE_REQUIRED", "A positive limit price is required", 400, false);
      limitPrice = formatFixedDecimal(parsedLimit, MONEY_DECIMAL_SCALE);
    } else if (input.limitPrice !== undefined) {
      throw new ApiError("MARKET_ORDER_LIMIT_PRICE_FORBIDDEN", "Market orders cannot include a limit price", 400, false);
    }

    const currentPosition = quantity(position.quantity, "INVALID_POSITION");
    if (input.side === "sell" && orderQuantity > currentPosition) {
      throw new ApiError("INSUFFICIENT_PAPER_POSITION", "Sell quantity exceeds the available long position", 409, false);
    }
    const executionReference = limitPrice === undefined ? quotePrice : money(limitPrice, "LIMIT_PRICE_REQUIRED");
    const estimatedNotionalValue = multiplyQuantityPrice(orderQuantity, executionReference);
    const buyingPower = money(account.buyingPower, "INVALID_BUYING_POWER");
    if (input.side === "buy" && estimatedNotionalValue > buyingPower) {
      throw new ApiError("INSUFFICIENT_BUYING_POWER", "Estimated notional exceeds Paper buying power", 409, false);
    }
    const estimatedPosition = input.side === "buy" ? currentPosition + orderQuantity : currentPosition - orderQuantity;
    const normalizedOrder: PaperOrderDraft = {
      symbol,
      side: input.side,
      quantity: formatFixedDecimal(orderQuantity, QUANTITY_DECIMAL_SCALE),
      type: input.type,
      timeInForce: input.timeInForce,
      ...(limitPrice === undefined ? {} : { limitPrice }),
    };
    const previewId = randomUUID();
    const expiresAt = new Date(this.dependencies.now().getTime() + 60_000).toISOString();
    const claims = { previewId, expiresAt, normalizedOrder };
    const equity = money(account.equity, "INVALID_ACCOUNT_EQUITY");
    const positionNotional = multiplyQuantityPrice(currentPosition, quotePrice);
    return {
      ...claims,
      estimatedNotional: formatFixedDecimal(estimatedNotionalValue, MONEY_DECIMAL_SCALE),
      quote: { price: formatFixedDecimal(quotePrice, MONEY_DECIMAL_SCALE), source: quote.source, asOf: quote.asOf },
      buyingPower: formatFixedDecimal(buyingPower, MONEY_DECIMAL_SCALE),
      positionBefore: formatFixedDecimal(currentPosition, QUANTITY_DECIMAL_SCALE),
      estimatedPositionAfter: formatFixedDecimal(estimatedPosition, QUANTITY_DECIMAL_SCALE),
      ...(equity > 0n ? {
        concentrationBefore: Number(positionNotional * 10_000n / equity) / 100,
        estimatedConcentrationAfter: Number(multiplyQuantityPrice(estimatedPosition, quotePrice) * 10_000n / equity) / 100,
      } : {}),
      warnings: input.type === "market"
        ? ["Paper execution price is not guaranteed"]
        : ["A limit order may not execute"],
      token: this.dependencies.tokens.issue(claims),
    };
  }
}
