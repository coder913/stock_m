import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { OrderPreviewClaims } from "../../shared/broker";
import { ApiError } from "../core/errors";

const claimsSchema = z.object({
  previewId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  normalizedOrder: z.object({
    symbol: z.string(),
    side: z.enum(["buy", "sell"]),
    quantity: z.string(),
    type: z.enum(["market", "limit"]),
    timeInForce: z.enum(["day", "gtc"]),
    limitPrice: z.string().optional(),
  }),
});

export interface OrderPreviewTokenService {
  issue(claims: OrderPreviewClaims): string;
  verify(token: string): OrderPreviewClaims;
}

export function createOrderPreviewTokenService(secret: Buffer, now: () => Date = () => new Date()): OrderPreviewTokenService {
  if (secret.length !== 32) throw new Error("Order preview token secret must contain exactly 32 bytes");
  const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");
  return {
    issue(claims) {
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return `${payload}.${sign(payload)}`;
    },
    verify(token) {
      const [payload, suppliedSignature, extra] = token.split(".");
      if (!payload || !suppliedSignature || extra) throw new ApiError("INVALID_ORDER_PREVIEW_TOKEN", "Order preview token is invalid", 400, false);
      const expectedSignature = sign(payload);
      const supplied = Buffer.from(suppliedSignature);
      const expected = Buffer.from(expectedSignature);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new ApiError("INVALID_ORDER_PREVIEW_TOKEN", "Order preview token is invalid", 400, false);
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        throw new ApiError("INVALID_ORDER_PREVIEW_TOKEN", "Order preview token is invalid", 400, false);
      }
      const result = claimsSchema.safeParse(decoded);
      if (!result.success) throw new ApiError("INVALID_ORDER_PREVIEW_TOKEN", "Order preview token is invalid", 400, false);
      if (Date.parse(result.data.expiresAt) <= now().getTime()) {
        throw new ApiError("ORDER_PREVIEW_EXPIRED", "Order preview has expired", 409, false);
      }
      return result.data;
    },
  };
}
