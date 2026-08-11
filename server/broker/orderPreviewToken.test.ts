// @vitest-environment node
import { expect, test } from "vitest";
import { createOrderPreviewTokenService } from "./orderPreviewToken";

const claims = {
  previewId: "00000000-0000-4000-8000-000000000101",
  expiresAt: "2026-08-11T14:01:00.000Z",
  normalizedOrder: {
    symbol: "NVDA",
    side: "buy" as const,
    quantity: "1.50000000",
    type: "limit" as const,
    timeInForce: "day" as const,
    limitPrice: "165.25000000",
  },
};

test("verifies an untampered preview token before expiry", () => {
  const tokens = createOrderPreviewTokenService(Buffer.alloc(32, 7), () => new Date("2026-08-11T14:00:30Z"));
  const token = tokens.issue(claims);

  expect(tokens.verify(token)).toEqual(claims);
});

test("rejects changed economic fields and expired previews", () => {
  const issuer = createOrderPreviewTokenService(Buffer.alloc(32, 7), () => new Date("2026-08-11T14:00:30Z"));
  const token = issuer.issue(claims);
  const [payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.normalizedOrder.quantity = "15.00000000";
  const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

  expect(() => issuer.verify(tampered)).toThrowError(expect.objectContaining({ code: "INVALID_ORDER_PREVIEW_TOKEN" }));
  expect(() => createOrderPreviewTokenService(Buffer.alloc(32, 7), () => new Date("2026-08-11T14:01:01Z")).verify(token))
    .toThrowError(expect.objectContaining({ code: "ORDER_PREVIEW_EXPIRED" }));
});
