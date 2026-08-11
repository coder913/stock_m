// @vitest-environment node
import { expect, test } from "vitest";
import { clientOrderIdFor } from "./clientOrderId";

test("derives a stable Alpaca-safe client order id from the immutable intent id", () => {
  const first = clientOrderIdFor("018f0df2-3abc-7def-8123-456789abcdef");
  const second = clientOrderIdFor("018f0df2-3abc-7def-8123-456789abcdef");

  expect(first).toBe(second);
  expect(first).toMatch(/^stockm-[a-z0-9_-]+$/);
  expect(first.length).toBeLessThanOrEqual(128);
});

test("does not collide for distinct intent ids", () => {
  expect(clientOrderIdFor("intent-1")).not.toBe(clientOrderIdFor("intent-2"));
});
